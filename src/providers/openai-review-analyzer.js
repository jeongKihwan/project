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
    sentiment: itemSchema({ positiveCount: { type: 'integer', minimum: 0 }, neutralCount: { type: 'integer', minimum: 0 }, negativeCount: { type: 'integer', minimum: 0 } }, ['positiveCount', 'neutralCount', 'negativeCount']),
    strengths: { type: 'array', maxItems: 5, items: itemSchema({ name: { type: 'string' }, count: { type: 'integer', minimum: 1 }, action: { type: 'string' }, evidenceIds }, ['name', 'count', 'action', 'evidenceIds']) },
    weaknesses: { type: 'array', maxItems: 5, items: itemSchema({ name: { type: 'string' }, count: { type: 'integer', minimum: 1 }, severity: { type: 'string', enum: ['높음', '보통', '낮음'] }, improvement: { type: 'string' }, evidenceIds }, ['name', 'count', 'severity', 'improvement', 'evidenceIds']) },
    keywords: { type: 'array', maxItems: 10, items: itemSchema({ name: { type: 'string' }, count: { type: 'integer', minimum: 1 } }, ['name', 'count']) },
    priorities: { type: 'array', maxItems: 5, items: itemSchema({ rank: { type: 'integer', minimum: 1, maximum: 5 }, title: { type: 'string' }, expectedEffect: { type: 'string' }, basis: { type: 'string' }, evidenceIds }, ['rank', 'title', 'expectedEffect', 'basis', 'evidenceIds']) },
    pageCopy: itemSchema({
      headline: itemSchema({ text: { type: 'string' }, evidenceIds }, ['text', 'evidenceIds']),
      benefits: { type: 'array', maxItems: 5, items: itemSchema({ text: { type: 'string' }, evidenceIds }, ['text', 'evidenceIds']) },
      anxietyRemovers: { type: 'array', maxItems: 3, items: itemSchema({ question: { type: 'string' }, answer: { type: 'string' }, evidenceIds }, ['question', 'answer', 'evidenceIds']) },
    }, ['headline', 'benefits', 'anxietyRemovers']),
    faq: { type: 'array', maxItems: 10, items: itemSchema({ question: { type: 'string' }, answer: { type: 'string' }, evidenceIds }, ['question', 'answer', 'evidenceIds']) },
  },
  required: ['summary', 'summaryEvidenceIds', 'sentiment', 'strengths', 'weaknesses', 'keywords', 'priorities', 'pageCopy', 'faq'],
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
  const analyzedReviews = reviewMap.size;
  const counted = (item, matched) => ({ name: String(item.name).slice(0, 80), count: Math.min(analyzedReviews, Math.max(matched.length, Number(item.count) || matched.length)), evidence: matched });
  const rawSentiment = ['positiveCount', 'neutralCount', 'negativeCount'].map((key) => Math.max(0, Number(raw.sentiment?.[key]) || 0));
  const sentimentTotal = rawSentiment.reduce((sum, count) => sum + count, 0);
  const sentimentCounts = sentimentTotal ? rawSentiment.map((count) => Math.round(count * analyzedReviews / sentimentTotal)) : [0, analyzedReviews, 0];
  sentimentCounts[1] += analyzedReviews - sentimentCounts.reduce((sum, count) => sum + count, 0);
  const sentimentPercents = sentimentCounts.map((count) => analyzedReviews ? Math.round(count * 100 / analyzedReviews) : 0);
  sentimentPercents[1] += 100 - sentimentPercents.reduce((sum, percent) => sum + percent, 0);
  const headlineEvidence = evidence(raw.pageCopy?.headline?.evidenceIds);
  return {
    totalReviews,
    analyzedReviews,
    summary: evidence(raw.summaryEvidenceIds).length ? String(raw.summary).slice(0, 500) : '리뷰에서 반복적으로 확인된 의견을 정리했습니다.',
    sentiment: {
      positive: { count: sentimentCounts[0], percent: sentimentPercents[0] },
      neutral: { count: sentimentCounts[1], percent: sentimentPercents[1] },
      negative: { count: sentimentCounts[2], percent: sentimentPercents[2] },
    },
    strengths: grounded(raw.strengths, (item, matched) => ({ ...counted(item, matched), action: String(item.action).slice(0, 300) })).sort((a, b) => b.count - a.count).slice(0, 5),
    weaknesses: grounded(raw.weaknesses, (item, matched) => ({ ...counted(item, matched), severity: ['높음', '보통', '낮음'].includes(item.severity) ? item.severity : '보통', improvement: String(item.improvement).slice(0, 300) })).sort((a, b) => b.count - a.count).slice(0, 5),
    keywords: (raw.keywords || []).map((item) => ({ name: String(item.name).slice(0, 80), count: Math.min(analyzedReviews, Math.max(1, Number(item.count) || 1)) })).slice(0, 10),
    priorities: grounded(raw.priorities, (item, matched) => ({ rank: Number(item.rank) || 1, title: String(item.title).slice(0, 120), expectedEffect: String(item.expectedEffect).slice(0, 300), basis: String(item.basis).slice(0, 500), evidence: matched })).sort((a, b) => a.rank - b.rank).slice(0, 5).map((item, index) => ({ ...item, rank: index + 1 })),
    pageCopy: {
      headline: headlineEvidence.length ? { text: String(raw.pageCopy.headline.text).slice(0, 500), evidence: headlineEvidence } : null,
      benefits: grounded(raw.pageCopy?.benefits, (item, matched) => ({ text: String(item.text).slice(0, 300), evidence: matched })).slice(0, 5),
      anxietyRemovers: grounded(raw.pageCopy?.anxietyRemovers, (item, matched) => ({ question: String(item.question).slice(0, 300), answer: String(item.answer).slice(0, 500), evidence: matched })).slice(0, 3),
    },
    faq: grounded(raw.faq, (item, matched) => ({ question: String(item.question).slice(0, 300), answer: String(item.answer).slice(0, 700), evidence: matched })).slice(0, 10),
  };
}

export async function analyzeWithOpenAI(reviews, env, context = {}) {
  const apiKey = env.OPENAI_API_KEY || env.openai_api_key;
  if (!apiKey) throw new Error('OPENAI_NOT_CONFIGURED');
  const selected = sampleReviews(reviews).map((text, index) => ({ id: `R${index + 1}`, text: String(text).slice(0, MAX_REVIEW_LENGTH) }));
  const reviewMap = new Map(selected.map((review) => [review.id, review.text]));
  const localBusiness = ['restaurant', 'cafe', 'beauty', 'local'].includes(context.businessType);
  const businessInstruction = localBusiness
    ? '분석 대상은 네이버 플레이스 기반 자영업 매장이다. strengths는 고객 만족 포인트, weaknesses는 주요 불만, priorities는 매장·서비스 개선 우선순위, pageCopy는 과장 없는 홍보 문구로 작성한다.'
    : '분석 대상은 네이버 스마트스토어 기반 온라인 상품이다. strengths는 구매 만족 포인트, priorities는 상품 개선 우선순위, pageCopy는 상세페이지 문구로 작성한다.';
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || DEFAULT_MODEL,
      store: false,
      max_output_tokens: 5500,
      reasoning: { effort: 'low' },
      instructions: [
        '당신은 한국어 고객 리뷰 분석가다.',
        businessInstruction,
        '오직 제공된 개인정보 마스킹 완료 리뷰만 근거로 사용한다.',
        '리뷰에 없는 제품 사실, 효능, 수치, 인증, 과장 표현을 절대 만들지 않는다.',
        '모든 요약, 장점, 단점, 개선 우선순위, 상세페이지 문구, FAQ에 직접 근거가 되는 리뷰 ID를 넣는다.',
        '감정 수치는 제공된 표본 리뷰를 긍정, 중립, 부정 중 하나로 분류한 실제 개수이며 세 개의 합은 표본 수와 같아야 한다.',
        '장점과 불만은 실제 언급 수가 많은 순서로 최대 5개를 만들고, 판매자가 바로 실행할 행동 제안 또는 개선 제안을 붙인다.',
        '상품 개선 우선순위는 리뷰 빈도와 불만 심각도를 근거로 정한다. 예상 효과는 보장 표현 없이 리뷰에서 추론 가능한 범위만 쓴다.',
        '상세페이지 문구는 메인 헤드라인, 핵심 베네핏, 구매 불안 제거 문구로 나누어 바로 복사할 수 있게 쓴다.',
        'FAQ는 반복 질문, 불만, 구매 전 불확실성을 바탕으로 최대 10개 작성한다. 근거가 없으면 개수를 억지로 채우지 않는다.',
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
