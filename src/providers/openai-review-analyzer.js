const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-5.4-mini';
const MAX_REVIEWS_SENT = 300;
const MAX_REVIEW_LENGTH = 500;

const itemSchema = (properties, required) => ({ type: 'object', additionalProperties: false, properties, required });
const evidenceIds = { type: 'array', items: { type: 'string' }, maxItems: 5 };
const analysisSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', maxLength: 500 },
    summaryEvidenceIds: evidenceIds,
    strengths: { type: 'array', maxItems: 5, items: itemSchema({ name: { type: 'string' }, count: { type: 'integer', minimum: 1 }, evidenceIds }, ['name', 'count', 'evidenceIds']) },
    weaknesses: { type: 'array', maxItems: 5, items: itemSchema({ name: { type: 'string' }, count: { type: 'integer', minimum: 1 }, evidenceIds }, ['name', 'count', 'evidenceIds']) },
    keywords: { type: 'array', maxItems: 10, items: itemSchema({ name: { type: 'string' }, count: { type: 'integer', minimum: 1 } }, ['name', 'count']) },
    purchasePoints: { type: 'array', maxItems: 5, items: itemSchema({ title: { type: 'string' }, reason: { type: 'string' }, evidenceIds }, ['title', 'reason', 'evidenceIds']) },
    copy: { type: 'array', minItems: 1, maxItems: 8, items: itemSchema({ category: { type: 'string' }, text: { type: 'string' }, evidenceIds }, ['category', 'text', 'evidenceIds']) },
  },
  required: ['summary', 'summaryEvidenceIds', 'strengths', 'weaknesses', 'keywords', 'purchasePoints', 'copy'],
};

function sampleReviews(reviews) {
  if (reviews.length <= MAX_REVIEWS_SENT) return reviews;
  return Array.from({ length: MAX_REVIEWS_SENT }, (_, index) => reviews[Math.floor(index * reviews.length / MAX_REVIEWS_SENT)]);
}

function outputText(response) {
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) return content.text;
      if (content.type === 'refusal') throw new Error('AI_REFUSAL');
    }
  }
  throw new Error('AI_EMPTY_RESPONSE');
}

function normalize(raw, reviewMap, totalReviews) {
  const evidence = (ids) => [...new Set(ids || [])].map((key) => reviewMap.get(key)).filter(Boolean);
  const grounded = (items, mapper) => (items || []).map((item) => {
    const matched = evidence(item.evidenceIds);
    return matched.length ? mapper(item, matched) : null;
  }).filter(Boolean);
  const counted = (item, matched) => ({ name: String(item.name).slice(0, 80), count: Math.min(totalReviews, Math.max(matched.length, Number(item.count) || matched.length)), evidence: matched });
  return {
    totalReviews,
    summary: evidence(raw.summaryEvidenceIds).length ? String(raw.summary).slice(0, 500) : '리뷰에서 반복적으로 확인된 의견을 정리했습니다.',
    strengths: grounded(raw.strengths, counted),
    weaknesses: grounded(raw.weaknesses, counted),
    keywords: (raw.keywords || []).map((item) => ({ name: String(item.name).slice(0, 80), count: Math.min(totalReviews, Math.max(1, Number(item.count) || 1)) })).slice(0, 10),
    purchasePoints: grounded(raw.purchasePoints, (item, matched) => ({ title: String(item.title).slice(0, 120), reason: String(item.reason).slice(0, 500), evidence: matched })),
    copy: grounded(raw.copy, (item, matched) => ({ category: String(item.category).slice(0, 80), text: String(item.text).slice(0, 500), evidence: matched })),
  };
}

export async function analyzeWithOpenAI(reviews, env) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_NOT_CONFIGURED');
  const selected = sampleReviews(reviews).map((text, index) => ({ id: `R${index + 1}`, text: String(text).slice(0, MAX_REVIEW_LENGTH) }));
  const reviewMap = new Map(selected.map((review) => [review.id, review.text]));
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || DEFAULT_MODEL,
      store: false,
      max_output_tokens: 3500,
      reasoning: { effort: 'low' },
      instructions: [
        '당신은 한국어 고객 리뷰 분석가다.',
        '오직 제공된 개인정보 마스킹 완료 리뷰만 근거로 사용한다.',
        '리뷰에 없는 제품 사실, 효능, 수치, 인증, 과장 표현을 절대 만들지 않는다.',
        '모든 요약, 장점, 단점, 구매 포인트, 추천 문구에 직접 근거가 되는 리뷰 ID를 넣는다.',
        '근거가 약하면 항목을 만들지 않는다. 개인정보를 추측하거나 복원하지 않는다.',
        'count는 해당 의견이 실제로 나타난 리뷰 수를 보수적으로 센다.',
        '추천 문구는 광고 문구이되 근거 리뷰가 주장하는 범위를 넘지 않는다.',
      ].join('\n'),
      input: `분석 대상 리뷰 ${reviews.length}개 중 균등 표본 ${selected.length}개입니다. 전체 수는 추정하지 말고 제공된 표본만 분석하세요.\n\n${selected.map((review) => `[${review.id}] ${review.text}`).join('\n')}`,
      text: { format: { type: 'json_schema', name: 'review_analysis', strict: true, schema: analysisSchema } },
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    const code = String(body.error?.code || body.error?.type || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    throw new Error(`OPENAI_REQUEST_FAILED_${response.status}_${code}`);
  }
  return normalize(JSON.parse(outputText(body)), reviewMap, reviews.length);
}
