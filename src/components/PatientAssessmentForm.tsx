import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { createEmptyAnswers, questionnaireDefinition } from "../shared/questionnaire";
import { normalizePatientInfo, validateRequiredAnswers } from "../shared/scoring";
import type { AssessmentAnswers, AssessmentRecord, PatientInfo, QuestionDefinition, RiskLevel } from "../shared/types";

interface PatientAssessmentFormProps {
  onSaved: (record: AssessmentRecord) => void;
}

const riskClassMap: Record<RiskLevel, string> = {
  低风险: "risk-low",
  中风险: "risk-mid",
  高风险: "risk-high",
  极高风险: "risk-critical",
};

const genderOptions = ["女", "男", "其他"];

const renderQuestionLabel = (question: QuestionDefinition): string => {
  return `${question.id}. ${question.title}`;
};

const QuestionField = ({
  question,
  value,
  onSingleChange,
  onMultiChange,
  onScaleChange,
}: {
  question: QuestionDefinition;
  value: AssessmentAnswers[string];
  onSingleChange: (questionId: string, optionValue: string) => void;
  onMultiChange: (questionId: string, optionValue: string) => void;
  onScaleChange: (questionId: string, numericValue: number) => void;
}) => {
  if (question.type === "single") {
    return (
      <fieldset className="question-field">
        <legend>{renderQuestionLabel(question)}</legend>
        <div className="option-grid">
          {question.options?.map((option) => (
            <label key={option.value} className="option-card">
              <input
                type="radio"
                name={question.id}
                checked={value === option.value}
                onChange={() => onSingleChange(question.id, option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (question.type === "multi") {
    const current = Array.isArray(value) ? value : [];
    return (
      <fieldset className="question-field">
        <legend>{renderQuestionLabel(question)}</legend>
        {question.helpText ? <p className="question-help">{question.helpText}</p> : null}
        <div className="option-grid">
          {question.options?.map((option) => (
            <label key={option.value} className="option-card">
              <input
                type="checkbox"
                checked={current.includes(option.value)}
                onChange={() => onMultiChange(question.id, option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  const min = question.min ?? 0;
  const max = question.max ?? 10;
  const numericValue = typeof value === "number" ? value : min;
  return (
    <fieldset className="question-field">
      <legend>{renderQuestionLabel(question)}</legend>
      <div className="scale-wrap">
        <input
          type="range"
          min={min}
          max={max}
          value={numericValue}
          step={question.step ?? 1}
          onChange={(event) => onScaleChange(question.id, Number(event.target.value))}
        />
        <div className="scale-value">{numericValue}</div>
      </div>
    </fieldset>
  );
};

export const PatientAssessmentForm = ({ onSaved }: PatientAssessmentFormProps) => {
  const [patientInfo, setPatientInfo] = useState<PatientInfo>({
    patientName: "",
    gender: "",
    age: null,
    assessmentDate: dayjs().format("YYYY-MM-DD"),
  });
  const [answers, setAnswers] = useState<AssessmentAnswers>(() => createEmptyAnswers());
  const [notes, setNotes] = useState("");
  const [latestRecord, setLatestRecord] = useState<AssessmentRecord | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const questionCount = useMemo(
    () => questionnaireDefinition.sections.reduce((sum, section) => sum + section.questions.length, 0),
    [],
  );

  const handleSingleChange = (questionId: string, optionValue: string): void => {
    setAnswers((previous) => ({ ...previous, [questionId]: optionValue }));
  };

  const handleMultiChange = (questionId: string, optionValue: string): void => {
    setAnswers((previous) => {
      const current = Array.isArray(previous[questionId]) ? [...(previous[questionId] as string[])] : [];
      let next: string[];
      if (current.includes(optionValue)) {
        next = current.filter((item) => item !== optionValue);
      } else {
        next = [...current, optionValue];
      }
      if (optionValue === "E" && next.includes("E")) {
        next = ["E"];
      }
      if (optionValue !== "E" && next.includes("E")) {
        next = next.filter((item) => item !== "E");
      }
      return { ...previous, [questionId]: next };
    });
  };

  const handleScaleChange = (questionId: string, numericValue: number): void => {
    setAnswers((previous) => ({ ...previous, [questionId]: numericValue }));
  };

  const resetForm = (): void => {
    setAnswers(createEmptyAnswers());
    setNotes("");
    setErrors([]);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const normalizedPatient = normalizePatientInfo(patientInfo);
    const localErrors: string[] = [];
    if (!normalizedPatient.patientName) {
      localErrors.push("请填写患者姓名。");
    }
    if (!normalizedPatient.gender) {
      localErrors.push("请选择患者性别。");
    }
    const missingIds = validateRequiredAnswers(answers);
    if (missingIds.length > 0) {
      localErrors.push(`问卷尚未填写完整：${missingIds.join(", ")}`);
    }
    if (localErrors.length > 0) {
      setErrors(localErrors);
      return;
    }

    try {
      setIsSaving(true);
      const saved = await window.assessmentApi.createAssessment({
        patientInfo: normalizedPatient,
        answers,
        notes: notes.trim(),
      });
      setLatestRecord(saved);
      onSaved(saved);
      resetForm();
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "保存失败，请稍后重试。"]);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="panel-stack">
      <section className="panel-card">
        <header className="panel-header">
          <h2>患者评估表</h2>
          <p>
            版本 {questionnaireDefinition.version}，共 {questionCount} 题。表单提交后将自动计算风险分层并存入 SQLite。
          </p>
        </header>
        <form className="assessment-form" onSubmit={handleSubmit}>
          <div className="basic-grid">
            <label>
              姓名
              <input
                value={patientInfo.patientName}
                onChange={(event) => setPatientInfo((previous) => ({ ...previous, patientName: event.target.value }))}
                placeholder="请输入患者姓名"
              />
            </label>
            <label>
              性别
              <select
                value={patientInfo.gender}
                onChange={(event) => setPatientInfo((previous) => ({ ...previous, gender: event.target.value }))}
              >
                <option value="">请选择</option>
                {genderOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              年龄
              <input
                type="number"
                min={1}
                max={120}
                value={patientInfo.age ?? ""}
                onChange={(event) =>
                  setPatientInfo((previous) => ({
                    ...previous,
                    age: event.target.value ? Number(event.target.value) : null,
                  }))
                }
                placeholder="可选"
              />
            </label>
            <label>
              评估日期
              <input
                type="date"
                value={patientInfo.assessmentDate}
                onChange={(event) => setPatientInfo((previous) => ({ ...previous, assessmentDate: event.target.value }))}
              />
            </label>
          </div>

          {questionnaireDefinition.sections.map((section) => (
            <section key={section.id} className="question-section">
              <h3>{section.title}</h3>
              {section.description ? <p>{section.description}</p> : null}
              {section.questions.map((question) => (
                <QuestionField
                  key={question.id}
                  question={question}
                  value={answers[question.id]}
                  onSingleChange={handleSingleChange}
                  onMultiChange={handleMultiChange}
                  onScaleChange={handleScaleChange}
                />
              ))}
            </section>
          ))}

          <label className="full-width">
            医生备注（可选）
            <textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="可记录就诊背景、沟通重点、家属诉求等"
            />
          </label>

          {errors.length > 0 ? (
            <div className="error-box">
              {errors.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          ) : null}

          <div className="actions-row">
            <button type="submit" disabled={isSaving}>
              {isSaving ? "保存中..." : "提交并评分"}
            </button>
          </div>
        </form>
      </section>

      {latestRecord ? (
        <section className="panel-card result-card">
          <header className="result-head">
            <h3>评分结果</h3>
            <span className={`risk-pill ${riskClassMap[latestRecord.riskLevel]}`}>{latestRecord.riskLevel}</span>
          </header>
          <p className="result-total">总分：{latestRecord.totalScore}</p>
          <div className="result-grid">
            <div>牙科焦虑：{latestRecord.score.breakdown.anxiety}</div>
            <div>咬合知觉：{latestRecord.score.breakdown.occlusalPerception}</div>
            <div>心理状态：{latestRecord.score.breakdown.psychosocial}</div>
            <div>期望管理：{latestRecord.score.breakdown.expectation}</div>
          </div>
          <p className="result-summary">{latestRecord.score.summary}</p>
          {latestRecord.score.flags.length > 0 ? (
            <div className="tag-wrap">
              {latestRecord.score.flags.map((flag) => (
                <span key={flag} className="flag-tag">
                  {flag}
                </span>
              ))}
            </div>
          ) : null}
          <ul className="recommend-list">
            {latestRecord.score.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
};
