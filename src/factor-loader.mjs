import { fetchOfficialJson } from './live-provider.mjs';
import { factorEndpoints, mergeFactors, parseIncome, parseInstitutions, parseMargin, parsePe, parseRevenue } from './factor-provider.mjs';

const SOURCES = factorEndpoints();
async function loadSafe(name, url) {
  try {
    const payload = await fetchOfficialJson(url);
    const rows = Array.isArray(payload) ? payload : [];
    return { name, rows, ok:true, error:null };
  } catch (error) { return { name, rows:[], ok:false, error:error.message }; }
}

export async function loadOfficialFactors() { return (await loadOfficialFactorsDetailed()).factors; }

export async function loadOfficialFactorsDetailed() {
  const results = [];
  for (const [name, url] of Object.entries(SOURCES)) results.push(await loadSafe(name, url));
  const rows = Object.fromEntries(results.map(result => [result.name, result.rows]));
  const revenue = mergeFactors(parseRevenue(rows.twseRevenue), parseRevenue(rows.tpexRevenue));
  const incomeSourceNames = Object.keys(rows).filter(name => name.startsWith('twseIncome') || name.startsWith('tpexIncome'));
  const income = mergeFactors(...incomeSourceNames.map(name => parseIncome(rows[name])));
  const valuation = mergeFactors(parsePe(rows.twsePe), parsePe(rows.tpexPe));
  const chips = mergeFactors(parseMargin(rows.twseMargin), parseMargin(rows.tpexMargin), parseInstitutions(rows.tpexInstitutions));
  const codes = new Set([...Object.keys(revenue), ...Object.keys(income), ...Object.keys(valuation), ...Object.keys(chips)]);
  const sourceRows = Object.fromEntries(results.map(result => [result.name, { ok:result.ok, rows:result.rows.length, error:result.error }]));
  return {
    factors:Object.fromEntries([...codes].map(code => [code, { revenue:revenue[code], income:income[code], valuation:valuation[code], chips:chips[code] }])),
    sources:{
      ...sourceRows,
      fieldAvailability:{
        reportedEps:{ available:true, sources:incomeSourceNames, semantic:'latest officially reported cumulative EPS from industry-specific statements; not fabricated trailing-four-quarter EPS' },
        revenueYoY:{ available:true, sources:['twseRevenue','tpexRevenue'], semantic:'official year-over-year monthly revenue growth' },
        foreign20:{ available:false, reason:'Current official OpenAPI batch sources provide daily institutional net trading, not a verified 20-session aggregate' },
        margin20:{ available:false, reason:'Current official OpenAPI batch sources provide daily margin balances, not a verified 20-session aggregate' }
      }
    }
  };
}
