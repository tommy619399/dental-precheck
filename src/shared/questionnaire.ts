import type {
  AssessmentAnswers,
  QuestionDefinition,
  QuestionnaireDefinition,
  SectionDefinition,
} from "./types.js";

export const QUESTIONNAIRE_VERSION = "2026.04-patient-v1";

const anxietyLikertOptions = [
  { value: "1", label: "1 分（不焦虑）", score: 1 },
  { value: "2", label: "2 分", score: 2 },
  { value: "3", label: "3 分", score: 3 },
  { value: "4", label: "4 分", score: 4 },
  { value: "5", label: "5 分（极度焦虑）", score: 5 },
];

const sections: SectionDefinition[] = [
  {
    id: "A",
    title: "A. 牙科焦虑反应",
    description: "请根据真实感受在相应数字上打钩（1 分：不焦虑；5 分：极度焦虑）。",
    questions: [
      {
        id: "A1",
        title: "想到明天要看牙医",
        type: "single",
        required: true,
        options: anxietyLikertOptions,
      },
      {
        id: "A2",
        title: "在诊室闻到消毒水的味道",
        type: "single",
        required: true,
        options: anxietyLikertOptions,
      },
      {
        id: "A3",
        title: "看到准备注射局部麻醉的针头",
        type: "single",
        required: true,
        options: anxietyLikertOptions,
      },
      {
        id: "A4",
        title: "听到牙钻工作的声音",
        type: "single",
        required: true,
        options: anxietyLikertOptions,
      },
      {
        id: "A5",
        title: "开口受限或口内有异物感时",
        type: "single",
        required: true,
        options: anxietyLikertOptions,
      },
    ],
  },
  {
    id: "B",
    title: "B. 咬合知觉与既往修复体验",
    description: "本部分旨在了解您对牙齿的感觉及既往治疗体验。",
    questions: [
      {
        id: "B1",
        title: "以前做假牙或补牙后，通常多久觉得“这颗牙是自己的”？",
        type: "single",
        required: true,
        options: [
          { value: "A", label: "A 即刻习惯", score: 0 },
          { value: "B", label: "B 约 1 周适应", score: 1 },
          { value: "C", label: "C 数月适应", score: 2 },
          { value: "D", label: "D 始终感觉不适", score: 4 },
        ],
      },
      {
        id: "B2",
        title: "对牙齿咬合间极细微差异（如一张纸厚度）是否敏感？",
        type: "single",
        required: true,
        options: [
          { value: "A", label: "A 不敏感", score: 0 },
          { value: "B", label: "B 正常", score: 1 },
          { value: "C", label: "C 较敏感", score: 2 },
          { value: "D", label: "D 极度敏感", score: 4 },
        ],
      },
      {
        id: "B3",
        title: "每天有多少时间会不自觉关注自己的咬合情况？",
        type: "single",
        required: true,
        options: [
          { value: "A", label: "A 偶尔/不关注", score: 0 },
          { value: "B", label: "B 吃饭或说话时关注", score: 1 },
          { value: "C", label: "C 超过一半清醒时间", score: 3 },
          { value: "D", label: "D 几乎整天都在想", score: 4 },
        ],
      },
      {
        id: "B4",
        title: "是否觉得咬合位置经常变化，抓不到固定位置？",
        type: "single",
        required: true,
        options: [
          { value: "A", label: "A 否", score: 0 },
          { value: "B", label: "B 偶尔", score: 1 },
          { value: "C", label: "C 是", score: 3 },
        ],
      },
      {
        id: "B5",
        title: "口腔习惯（可多选）",
        type: "multi",
        required: true,
        helpText: "选择“E 无”时将自动清除其他选项。",
        options: [
          { value: "A", label: "A 夜磨牙", score: 2 },
          { value: "B", label: "B 紧咬牙", score: 2 },
          { value: "C", label: "C 咀嚼肌酸痛", score: 2 },
          { value: "D", label: "D 喜食硬物", score: 1 },
          { value: "E", label: "E 无", score: 0 },
        ],
      },
      {
        id: "B6",
        title: "针对之前修复体，最不满意的地方是",
        type: "single",
        required: true,
        options: [
          { value: "A", label: "A 颜色", score: 1 },
          { value: "B", label: "B 易碎裂", score: 1 },
          { value: "C", label: "C 咬合不适", score: 3 },
          { value: "D", label: "D 价格", score: 0 },
          { value: "E", label: "E 其他", score: 1 },
        ],
      },
    ],
  },
  {
    id: "C",
    title: "C. 近期心理状态与个体倾向",
    description: "请选择最符合您近况的描述。",
    questions: [
      {
        id: "C1",
        title: "为了解决当前口腔问题，之前咨询过几位医生？",
        type: "single",
        required: true,
        options: [
          { value: "A", label: "A 1 位", score: 0 },
          { value: "B", label: "B 2-3 位", score: 2 },
          { value: "C", label: "C 4 位及以上（Doctor Shopping 预警）", score: 4 },
        ],
      },
      {
        id: "C2",
        title: "性格倾向更接近哪一类？",
        type: "single",
        required: true,
        options: [
          { value: "A", label: "A 随遇而安", score: 0 },
          { value: "B", label: "B 细心务实", score: 1 },
          { value: "C", label: "C 完美主义", score: 2 },
          { value: "D", label: "D 易焦虑敏感", score: 3 },
        ],
      },
      {
        id: "C3",
        title: "过去两周内是否频繁感到紧张、焦虑或压力巨大？",
        type: "single",
        required: true,
        options: [
          { value: "A", label: "A 从不", score: 0 },
          { value: "B", label: "B 有几天", score: 1 },
          { value: "C", label: "C 一半以上时间", score: 2 },
          { value: "D", label: "D 几乎每天", score: 3 },
        ],
      },
      {
        id: "C4",
        title: "新假牙若有极细微外观差异（功能正常），是否能接受？",
        type: "single",
        required: true,
        options: [
          { value: "A", label: "A 完全没问题", score: 0 },
          { value: "B", label: "B 稍有遗憾但能接受", score: 1 },
          { value: "C", label: "C 无法接受，必须完美", score: 3 },
        ],
      },
    ],
  },
  {
    id: "D",
    title: "D. 治疗目标与期望管理",
    description: "请明确您的治疗目标。",
    questions: [
      {
        id: "D1",
        title: "对本次新修复体的期望是",
        type: "single",
        required: true,
        options: [
          { value: "A", label: "A 能用就行", score: 0 },
          { value: "B", label: "B 更坚固耐用", score: 1 },
          { value: "C", label: "C 无感舒适", score: 3 },
          { value: "D", label: "D 完美且终身使用", score: 5 },
        ],
      },
      {
        id: "D2",
        title: "请标出您对治疗结果的重视程度（0 无所谓，10 必须完美）",
        type: "scale",
        required: true,
        min: 0,
        max: 10,
        step: 1,
      },
    ],
  },
];

export const questionnaireDefinition: QuestionnaireDefinition = {
  version: QUESTIONNAIRE_VERSION,
  name: "牙科修复术前心理与咬合知觉评估量表（患者版）",
  sections,
};

export const questionMap = new Map<string, QuestionDefinition>(
  sections.flatMap((section) => section.questions.map((question) => [question.id, question])),
);

export const habitLabels: Record<string, string> = {
  A: "夜磨牙",
  B: "紧咬牙",
  C: "咀嚼肌酸痛",
  D: "喜食硬物",
  E: "无",
};

export const dissatisfactionLabels: Record<string, string> = {
  A: "颜色",
  B: "易碎裂",
  C: "咬合不适",
  D: "价格",
  E: "其他",
};

export const createEmptyAnswers = (): AssessmentAnswers => {
  const defaults: AssessmentAnswers = {};
  sections.forEach((section) => {
    section.questions.forEach((question) => {
      if (question.type === "multi") {
        defaults[question.id] = [];
        return;
      }
      if (question.type === "scale") {
        defaults[question.id] = question.min ?? 0;
      } else {
        defaults[question.id] = "";
      }
    });
  });
  return defaults;
};
