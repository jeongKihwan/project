const themes = [
  { key: '품질', words: ['품질', '퀄리티', '좋아요', '좋습니다', '만족', '튼튼'], positive: true },
  { key: '배송', words: ['배송', '도착', '빠르'], positive: true },
  { key: '포장', words: ['포장', '선물'], positive: true },
  { key: '가격', words: ['가격', '가성비', '부담'], positive: true },
  { key: '디자인', words: ['디자인', '예쁘'], positive: true },
  { key: '사이즈', words: ['사이즈', '작아요', '커요'], positive: false },
  { key: '배송', words: ['늦', '지연'], positive: false }
];

function evidenceFor(reviews, words) {
  return reviews.filter((review) => words.some((word) => review.includes(word))).slice(0, 3);
}

function rank(reviews, positive) {
  return themes.filter((theme) => theme.positive === positive)
    .map((theme) => ({ ...theme, evidence: evidenceFor(reviews, theme.words) }))
    .filter((theme) => theme.evidence.length)
    .sort((a, b) => b.evidence.length - a.evidence.length);
}

class LocalReviewAnalyzer {
  async analyze(reviews) {
    const positives = rank(reviews, true);
    const negatives = rank(reviews, false);
    const keywordMap = new Map();
    [...positives, ...negatives].forEach((theme) => keywordMap.set(theme.key, (keywordMap.get(theme.key) || 0) + theme.evidence.length));
    const strengths = positives.slice(0, 3).map((theme) => ({ name: theme.key, count: theme.evidence.length, evidence: theme.evidence }));
    const weaknesses = negatives.slice(0, 3).map((theme) => ({ name: theme.key, count: theme.evidence.length, evidence: theme.evidence }));
    const top = strengths[0];
    const headline = top ? `고객이 직접 확인한 ${top.name}, 믿고 선택하세요.` : '고객 리뷰에서 찾은 제품의 강점을 확인하세요.';
    return {
      totalReviews: reviews.length,
      summary: top ? `고객 리뷰에서 ${top.name} 관련 긍정 의견이 가장 많이 확인됐습니다.` : '반복적으로 언급된 고객 의견을 정리했습니다.',
      strengths,
      weaknesses,
      keywords: [...keywordMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })),
      purchasePoints: strengths.map((item) => ({ title: item.name, reason: item.evidence[0] })),
      copy: [
        { category: '대표 헤드라인', text: headline, evidence: top?.evidence || [] },
        { category: '고객 신뢰 문구', text: top ? `실제 고객 리뷰에서 확인된 ${top.name} 만족 경험을 만나보세요.` : '실제 고객 리뷰를 바탕으로 추천합니다.', evidence: top?.evidence || [] },
        { category: '짧은 강조 문구', text: top ? `고객이 남긴 ${top.name} 만족 후기` : '고객 리뷰 기반 추천', evidence: top?.evidence || [] }
      ]
    };
  }
}

module.exports = { LocalReviewAnalyzer };
