// Transparent, rule-based change risk scoring (no machine learning).
// Each rule adds points; the factors that fired are stored so reviewers can see WHY.

const CATEGORY_WEIGHT = {
  'Product/GL Configuration': 25,
  'Interface/API': 20,
  'Batch Job': 20,
  'Database': 25,
  'Parameter': 10,
  'Patch': 15,
};

function scoreChange(c) {
  const factors = [];
  let score = 0;
  const add = (points, label) => { score += points; factors.push({ points, label }); };

  add(CATEGORY_WEIGHT[c.category] ?? 10, `Category: ${c.category}`);

  if (c.environment === 'Production') add(25, 'Targets Production environment');
  else if (c.environment === 'UAT') add(5, 'Targets UAT environment');

  if (c.affects_batch) add(15, 'Affects EOD/batch processing');
  if (!c.tested) add(20, 'Not tested before submission');
  if (!c.rollback_plan || !String(c.rollback_plan).trim()) add(15, 'No rollback plan supplied');
  if (c.change_type === 'Emergency') add(15, 'Emergency change (reduced review time)');

  score = Math.min(score, 100);
  const level = score >= 60 ? 'High' : score >= 35 ? 'Medium' : 'Low';
  return { score, level, factors, requiresCab: level === 'High' };
}

module.exports = { scoreChange };
