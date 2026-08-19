const PAID_STATUSES = new Set(['ACTIVE', 'TRIALING']);
const RESERVATION_TTL_MS = 15 * 60 * 1000;

function validFuture(value) {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

async function freeAccess(env) {
  const plan = await env.DB.prepare("SELECT id,name,credits FROM plans WHERE id='free' AND active=1").first();
  if (!plan) throw new Error('FREE_PLAN_MISSING');
  return { planId: plan.id, planName: plan.name, limit: Number(plan.credits), fullResults: false, periodKey: 'free:lifetime', periodStart: null, periodEnd: null, status: 'ACTIVE', cancelAtPeriodEnd: false };
}

export async function accessForUser(env, userId) {
  const subscription = await env.DB.prepare('SELECT subscriptions.*,plans.name,plans.credits FROM subscriptions JOIN plans ON plans.id=subscriptions.plan_id WHERE subscriptions.user_id=? AND plans.active=1').bind(userId).first();
  if (!subscription || subscription.plan_id === 'free') return freeAccess(env);
  if (!PAID_STATUSES.has(String(subscription.status).toUpperCase()) || !validFuture(subscription.current_period_end)) return freeAccess(env);
  return {
    planId: subscription.plan_id,
    planName: subscription.name,
    limit: Number(subscription.credits),
    fullResults: true,
    periodKey: `${subscription.current_period_start}:${subscription.current_period_end}`,
    periodStart: subscription.current_period_start,
    periodEnd: subscription.current_period_end,
    status: subscription.status,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
  };
}

export async function usageForAccess(env, userId, access) {
  const cutoff = new Date(Date.now() - RESERVATION_TTL_MS).toISOString();
  const row = await env.DB.prepare("SELECT COUNT(*) AS used FROM analysis_usage WHERE user_id=? AND period_key=? AND (status='COMPLETED' OR (status='RESERVED' AND created_at>?))").bind(userId, access.periodKey, cutoff).first();
  return { used: Number(row?.used || 0), limit: access.limit, remaining: Math.max(0, access.limit - Number(row?.used || 0)) };
}

export async function reserveAnalysis(env, userId, requestId, access) {
  const cutoff = new Date(Date.now() - RESERVATION_TTL_MS).toISOString();
  let existing = await env.DB.prepare('SELECT id,user_id,analysis_id,status,created_at FROM analysis_usage WHERE id=?').bind(requestId).first();
  if (existing?.status === 'RESERVED' && existing.created_at < cutoff) {
    await env.DB.prepare("DELETE FROM analysis_usage WHERE id=? AND status='RESERVED' AND created_at<?").bind(requestId, cutoff).run();
    existing = null;
  }
  if (existing) {
    if (existing.user_id !== userId) throw new Error('ANALYSIS_REQUEST_CONFLICT');
    return { duplicate: true, ...existing };
  }
  const result = await env.DB.prepare("INSERT INTO analysis_usage (id,user_id,plan_id,period_key,status,created_at) SELECT ?,?,?,?,'RESERVED',? WHERE (SELECT COUNT(*) FROM analysis_usage WHERE user_id=? AND period_key=? AND (status='COMPLETED' OR (status='RESERVED' AND created_at>?))) < ?").bind(requestId, userId, access.planId, access.periodKey, new Date().toISOString(), userId, access.periodKey, cutoff, access.limit).run();
  if (Number(result.meta?.changes || 0) !== 1) throw new Error('PLAN_LIMIT_REACHED');
  return { duplicate: false, id: requestId, status: 'RESERVED', analysis_id: null };
}

export async function releaseAnalysisReservation(env, userId, requestId) {
  await env.DB.prepare("DELETE FROM analysis_usage WHERE id=? AND user_id=? AND status='RESERVED'").bind(requestId, userId).run();
}

export function previewResult(result) {
  const legacyCopy = result.copy || [];
  const headline = result.pageCopy?.headline || (legacyCopy[0] ? { text: legacyCopy[0].text, evidence: legacyCopy[0].evidence || [] } : null);
  const benefits = (result.pageCopy?.benefits || legacyCopy.slice(1).map((item) => ({ text: item.text, evidence: item.evidence || [] }))).slice(0, headline ? 2 : 3);
  const priorities = result.priorities || (result.purchasePoints || []).map((item, index) => ({ rank: index + 1, title: item.title, expectedEffect: item.reason, basis: item.reason, evidence: item.evidence || [] }));
  return {
    totalReviews: result.totalReviews,
    analyzedReviews: result.analyzedReviews,
    summary: result.summary,
    sentiment: result.sentiment,
    strengths: (result.strengths || []).slice(0, 3),
    weaknesses: (result.weaknesses || []).slice(0, 3),
    priorities: priorities.slice(0, 1),
    pageCopy: { headline, benefits, anxietyRemovers: [] },
    keywords: [],
    faq: [],
  };
}

export function resultForAccess(result, access) {
  return access.fullResults ? result : previewResult(result);
}

export function accessPayload(access, usage) {
  return {
    planId: access.planId,
    planName: access.planName,
    fullResults: access.fullResults,
    status: access.status,
    cancelAtPeriodEnd: access.cancelAtPeriodEnd,
    periodStart: access.periodStart,
    periodEnd: access.periodEnd,
    usage,
  };
}
