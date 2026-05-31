function saveKey() {
  try {
    const raw = apiKeyInput.value.trim();
    // Accept masked value (already saved) or a new key starting with 'sk-'
    if (!raw || raw.startsWith('•')) {
      if (window.AP3X_API_KEY) {
        keyStatusEl.textContent = '✓ Key already saved';
        keyStatusEl.style.color  = 'var(--accent)';
      } else {
        keyStatusEl.textContent = 'Paste your OpenAI key (starts with sk-...)';
        keyStatusEl.style.color  = '#ff6b6b';
      }
      return;
    }
    if (!raw.startsWith('sk-')) {
      keyStatusEl.textContent = 'Invalid key — must start with sk-...';
      keyStatusEl.style.color  = '#ff6b6b';
      return;
    }
    const k = raw;
    localStorage.setItem('ap3x_openai_key', k);
    window.AP3X_API_KEY  = k;
    apiKeyInput.value    = '•'.repeat(Math.min(k.length, 24));
    keyStatusEl.textContent = '✓ Key saved — ready to analyse';
    keyStatusEl.style.color  = 'var(--accent)';
  } catch (e) {
    keyStatusEl.textContent = 'Error saving key: ' + e.message;
    keyStatusEl.style.color  = '#ff6b6b';
  }
}/* ================================
   AP3XVER5E — Core App v2.0
   Phase 2 — Intelligence Layer
   ================================ */

'use strict';

// ═══════════════════════════════════════════════════
// SECTION 1 — IndexedDB (SSOT, v2 schema migration)
// ═══════════════════════════════════════════════════
const DB_NAME    = 'ap3xver5e';
const DB_VERSION = 3;           // v3: digital_twin model
const STORE      = 'projects';
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const d    = e.target.result;
      const old  = e.oldVersion;

      // Fresh install
      if (!d.objectStoreNames.contains(STORE)) {
        const s = d.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('created_at', 'created_at', { unique: false });
        s.createIndex('url',        'url',        { unique: false });
        return;
      }

      // Migration from v1 → v2: no structural change needed,
      // existing records will display Phase 1 reports and show
      // Phase 2 reports as "not analysed" placeholders.
    };

    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror   = (e) => reject(new Error('DB open failed: ' + e.target.error?.message));
    req.onblocked = ()  => reject(new Error('DB blocked — close other tabs and retry.'));
  });
}

function dbGetAll() {
  return new Promise((resolve, reject) => {
    try {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = (e) => reject(new Error('DB read failed: ' + e.target.error?.message));
    } catch (e) { reject(new Error('Storage read error: ' + e.message)); }
  });
}

function dbPut(record) {
  return new Promise((resolve, reject) => {
    try {
      const tx  = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(record);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(new Error('DB write failed: ' + e.target.error?.message));
    } catch (e) { reject(new Error('Storage write error: ' + e.message)); }
  });
}

function dbDelete(id) {
  return new Promise((resolve, reject) => {
    try {
      const tx  = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(new Error('DB delete failed: ' + e.target.error?.message));
    } catch (e) { reject(new Error('Storage delete error: ' + e.message)); }
  });
}

async function dbFindByURL(normURL) {
  const all = await dbGetAll();
  return all.find(p => p.url === normURL) || null;
}


// ═══════════════════════════════════════════════════
// SECTION 2 — Utilities
// ═══════════════════════════════════════════════════
function uid() {
  return 'px_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}
function fmtDateShort(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: '2-digit'
  });
}
function isValidURL(str) {
  try {
    const u = new URL(str.startsWith('http') ? str : 'https://' + str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}
function normalizeURL(str) {
  try {
    const full = str.startsWith('http') ? str : 'https://' + str;
    const u    = new URL(full);
    return u.origin + u.pathname.replace(/\/$/, '') + u.search;
  } catch { return str; }
}
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
function emojiFor(url) {
  const h = domainOf(url).toLowerCase();
  if (h.includes('github'))                          return '🐙';
  if (h.includes('google'))                          return '🔍';
  if (h.includes('twitter') || h.includes('x.com')) return '𝕏';
  if (h.includes('linkedin'))                        return '💼';
  if (h.includes('youtube'))                         return '▶';
  if (h.includes('stripe'))                          return '💳';
  if (h.includes('notion'))                          return '📝';
  if (h.includes('figma'))                           return '🎨';
  if (h.includes('vercel'))                          return '▲';
  if (h.includes('shopify'))                         return '🛍';
  if (h.includes('apple'))                           return '🍎';
  return '⬡';
}




// ═══════════════════════════════════════════════════
// SECTION 4b — Digital Twin Builder
// ═══════════════════════════════════════════════════

/**
 * buildDigitalTwin(analysis)
 *
 * Takes a coerced analysis object and assembles it into the
 * canonical digital_twin envelope:
 *
 *   digital_twin: {
 *     reports:             { overview, business, technical, investor, roadmap }
 *     scores:              { business, technical, investor, scalability, innovation }
 *     competitor_analysis: { possible_competitors, market_position,
 *                            differentiation_points, weakness_vs_market }
 *     evolution_notes:     []   ← reserved for future mutation tracking
 *   }
 *
 * The original flat `analysis` object is ALSO kept on the project
 * record for full backward compatibility with all existing render paths.
 */
function buildDigitalTwin(analysis) {
  return {
    reports: {
      overview:   analysis.report_overview   || {},
      business:   analysis.report_business   || {},
      technical:  analysis.report_technical  || {},
      investor:   analysis.report_investor   || {},
      roadmap:    analysis.report_roadmap    || {},
    },
    scores: {
      business:    Math.min(100, Math.max(0, parseInt(analysis.business_score,    10) || 0)),
      technical:   Math.min(100, Math.max(0, parseInt(analysis.technical_score,   10) || 0)),
      investor:    Math.min(100, Math.max(0, parseInt(analysis.investor_score,    10) || 0)),
      scalability: Math.min(100, Math.max(0, parseInt(analysis.scalability_score, 10) || 0)),
      innovation:  Math.min(100, Math.max(0, parseInt(analysis.innovation_score,  10) || 0)),
    },
    competitor_analysis: analysis.competitor_analysis || {
      possible_competitors:   ['assumed category match'],
      market_position:        'assumed category match',
      differentiation_points: ['assumed category match'],
      weakness_vs_market:     ['assumed category match'],
    },
    evolution_notes: [],   // reserved — populated by future mutation/update events
    insight_summary: analysis.insight_summary || INSIGHT_FALLBACK.insight_summary,
    multi_agent_intelligence: analysis.multi_agent_intelligence || MULTI_AGENT_FALLBACK.multi_agent_intelligence,
    intelligence_fusion:      analysis.intelligence_fusion      || FUSION_FALLBACK.intelligence_fusion,
    decision_engine:          analysis.decision_engine          || DECISION_FALLBACK.decision_engine,
    cross_project_links:      analysis.cross_project_links      || CROSS_FALLBACK.cross_project_links,
    knowledge_graph:          analysis.knowledge_graph          || GRAPH_FALLBACK.knowledge_graph,
    semantic_memory:          analysis.semantic_memory          || SEMANTIC_FALLBACK.semantic_memory,
    cross_project_reasoning:  analysis.cross_project_reasoning  || REASONING_FALLBACK.cross_project_reasoning,
    portfolio_intelligence_report: analysis.portfolio_intelligence_report || PORTFOLIO_FALLBACK.portfolio_intelligence_report,
    portfolio_visual_map:          analysis.portfolio_visual_map          || VISUAL_MAP_FALLBACK.portfolio_visual_map,
    reasoning_trace:               analysis.reasoning_trace               || TRACE_FALLBACK.reasoning_trace,
    confidence_model:              analysis.confidence_model              || CONFIDENCE_FALLBACK.confidence_model,
    comparison_engine:             analysis.comparison_engine             || COMPARISON_FALLBACK.comparison_engine,
    builder_profile:               analysis.builder_profile               || BUILDER_FALLBACK.builder_profile,
    evolution_tracker:             analysis.evolution_tracker             || EVOLUTION_FALLBACK.evolution_tracker,
    what_if_engine:                analysis.what_if_engine                || WHATIF_FALLBACK.what_if_engine,

    // ── intelligence_layer_index ──
    // Read-only manifest. Declares which phases are populated in this twin.
    // Computed deterministically from what's present in analysis.
    // Never throws — always returns a boolean map.
    intelligence_layer_index: {
      phase_1_ingestion:           !!(analysis.project_name),
      phase_2_reports:             !!(analysis.report_overview),
      phase_2_scores:              !!(analysis.business_score),
      phase_3_agents:              !!(analysis.multi_agent_intelligence),
      phase_3_fusion:              !!(analysis.intelligence_fusion),
      phase_3_decision:            !!(analysis.decision_engine),
      phase_4_knowledge_graph:     !!(analysis.knowledge_graph?.nodes?.length),
      phase_5_semantic_memory:     !!(analysis.semantic_memory?.strategic_role),
      phase_6_cross_reasoning:     !!(analysis.cross_project_reasoning?.portfolio_summary),
      phase_7_portfolio_report:    !!(analysis.portfolio_intelligence_report?.overview),
      phase_8_visual_map:          !!(analysis.portfolio_visual_map?.nodes?.length),
      phase_9_reasoning_trace:     !!(analysis.reasoning_trace?.final_reasoning_summary),
      phase_10_confidence_model:   !!(analysis.confidence_model?.reliability_summary),
      phase_11_comparison_engine:  !!(analysis.comparison_engine?.comparison_pairs?.length),
      phase_12_builder_profile:    !!(analysis.builder_profile?.overall_builder_summary),
      phase_13_evolution_tracker:  !!(analysis.evolution_tracker?.portfolio_evolution_summary),
      phase_14_what_if_engine:     !!(analysis.what_if_engine?.scenarios?.length),
    },
  };
}

/**
 * validateDigitalTwin(dt)
 * Ensures all top-level twin keys are present and correctly typed.
 */
function validateDigitalTwin(dt) {
  if (!dt || typeof dt !== 'object') throw new Error('digital_twin missing.');
  const required = ['reports', 'scores', 'competitor_analysis', 'evolution_notes'];
  for (const k of required) {
    if (!(k in dt)) throw new Error(`digital_twin missing key: ${k}`);
  }
  if (!Array.isArray(dt.evolution_notes)) throw new Error('digital_twin.evolution_notes must be an array.');
  const reportKeys = ['overview','business','technical','investor','roadmap'];
  for (const k of reportKeys) {
    if (!(k in dt.reports)) throw new Error(`digital_twin.reports missing: ${k}`);
  }
  const scoreKeys = ['business','technical','investor','scalability','innovation'];
  for (const k of scoreKeys) {
    if (!(k in dt.scores)) throw new Error(`digital_twin.scores missing: ${k}`);
    if (typeof dt.scores[k] !== 'number') throw new Error(`digital_twin.scores.${k} must be a number.`);
  }
  const caKeys = ['possible_competitors','market_position','differentiation_points','weakness_vs_market'];
  for (const k of caKeys) {
    if (!(k in dt.competitor_analysis)) throw new Error(`digital_twin.competitor_analysis missing: ${k}`);
  }
  if (!dt.insight_summary || typeof dt.insight_summary !== 'object')
    throw new Error('digital_twin.insight_summary missing.');
  const insightKeys = ['strengths','risks','growth_opportunities','verdict'];
  for (const k of insightKeys) {
    if (!(k in dt.insight_summary)) throw new Error(`digital_twin.insight_summary missing: ${k}`);
  }
  if (!dt.multi_agent_intelligence || typeof dt.multi_agent_intelligence !== 'object')
    throw new Error('digital_twin.multi_agent_intelligence missing.');
  const agentKeys = ['research','business','technical','investor','risk','growth'];
  for (const k of agentKeys) {
    if (!(k in dt.multi_agent_intelligence)) throw new Error(`digital_twin.multi_agent_intelligence missing agent: ${k}`);
  }
  if (!dt.intelligence_fusion || typeof dt.intelligence_fusion !== 'object')
    throw new Error('digital_twin.intelligence_fusion missing.');
  const fusionKeys = ['unified_summary','key_insights','contradictions','strongest_opportunities','biggest_risks','overall_intelligence_score'];
  for (const k of fusionKeys) {
    if (!(k in dt.intelligence_fusion)) throw new Error(`digital_twin.intelligence_fusion missing: ${k}`);
  }
  if (typeof dt.intelligence_fusion.overall_intelligence_score !== 'number')
    throw new Error('digital_twin.intelligence_fusion.overall_intelligence_score must be a number.');
  if (!dt.decision_engine || typeof dt.decision_engine !== 'object')
    throw new Error('digital_twin.decision_engine missing.');
  const decisionFields = ['viability','recommendation','build_recommendation','confidence_score','reasoning_summary'];
  for (const k of decisionFields) {
    if (!(k in dt.decision_engine)) throw new Error(`digital_twin.decision_engine missing: ${k}`);
  }
  const VALID_VIABILITY = ['high','medium','low'];
  const VALID_BUILD_REC = ['scale','improve','pivot','avoid'];
  if (!VALID_VIABILITY.includes(dt.decision_engine.viability))
    throw new Error(`digital_twin.decision_engine.viability invalid: ${dt.decision_engine.viability}`);
  if (!VALID_BUILD_REC.includes(dt.decision_engine.build_recommendation))
    throw new Error(`digital_twin.decision_engine.build_recommendation invalid: ${dt.decision_engine.build_recommendation}`);
  if (typeof dt.decision_engine.confidence_score !== 'number')
    throw new Error('digital_twin.decision_engine.confidence_score must be a number.');
  // cross_project_links: validate shape only when present (computed post-initial-save)
  if (dt.cross_project_links) {
    const crossFields = ['similar_projects','shared_patterns','market_clusters'];
    for (const k of crossFields) {
      if (!Array.isArray(dt.cross_project_links[k]))
        throw new Error(`digital_twin.cross_project_links.${k} must be an array.`);
    }
  }
  // knowledge_graph: validate shape only when present (computed post-initial-save)
  if (dt.knowledge_graph) {
    if (!Array.isArray(dt.knowledge_graph.nodes))
      throw new Error('digital_twin.knowledge_graph.nodes must be an array.');
    if (!Array.isArray(dt.knowledge_graph.edges))
      throw new Error('digital_twin.knowledge_graph.edges must be an array.');
    // graph_visualisation_data — optional (absent on legacy records before v4.3)
    if (dt.knowledge_graph.graph_visualisation_data !== undefined) {
      const gvd = dt.knowledge_graph.graph_visualisation_data;
      if (!Array.isArray(gvd.nodes))
        throw new Error('graph_visualisation_data.nodes must be an array.');
      if (!Array.isArray(gvd.edges))
        throw new Error('graph_visualisation_data.edges must be an array.');
      // Validate vis node shape when nodes exist
      gvd.nodes.forEach((vn, idx) => {
        const vnFields = ['id','label','type','importance_score'];
        vnFields.forEach(f => {
          if (!(f in vn)) throw new Error(`graph_visualisation_data.nodes[${idx}] missing: ${f}`);
        });
        if (typeof vn.importance_score !== 'number' || vn.importance_score < 0 || vn.importance_score > 100)
          throw new Error(`graph_visualisation_data.nodes[${idx}].importance_score out of range.`);
      });
      // Validate vis edge shape when edges exist
      gvd.edges.forEach((ve, idx) => {
        const veFields = ['from','to','weight','type'];
        veFields.forEach(f => {
          if (!(f in ve)) throw new Error(`graph_visualisation_data.edges[${idx}] missing: ${f}`);
        });
        if (typeof ve.weight !== 'number' || ve.weight < 0 || ve.weight > 1)
          throw new Error(`graph_visualisation_data.edges[${idx}].weight out of range: ${ve.weight}`);
        const VALID_TYPES = ['SIMILAR_TO','SAME_INDUSTRY','SHARED_FEATURES','SHARED_RISKS','SHARED_OPPORTUNITIES'];
        if (!VALID_TYPES.includes(ve.type))
          throw new Error(`graph_visualisation_data.edges[${idx}].type invalid: ${ve.type}`);
      });
    }
    // intelligence_clusters — optional (absent on legacy records before v4.2)
    if (dt.knowledge_graph.intelligence_clusters !== undefined) {
      if (!Array.isArray(dt.knowledge_graph.intelligence_clusters))
        throw new Error('digital_twin.knowledge_graph.intelligence_clusters must be an array.');
      dt.knowledge_graph.intelligence_clusters.forEach((cl, idx) => {
        const clFields = ['cluster_name','projects','shared_characteristics','cluster_score'];
        clFields.forEach(f => {
          if (!(f in cl)) throw new Error(`intelligence_clusters[${idx}] missing field: ${f}`);
        });
        if (!Array.isArray(cl.projects))
          throw new Error(`intelligence_clusters[${idx}].projects must be an array.`);
        if (!Array.isArray(cl.shared_characteristics))
          throw new Error(`intelligence_clusters[${idx}].shared_characteristics must be an array.`);
        if (typeof cl.cluster_score !== 'number' || cl.cluster_score < 0 || cl.cluster_score > 100)
          throw new Error(`intelligence_clusters[${idx}].cluster_score out of range: ${cl.cluster_score}`);
        const VALID_CLUSTERS = ['SaaS','AI Tools','Education Platforms','Business Systems','Automation Systems'];
        if (!VALID_CLUSTERS.includes(cl.cluster_name))
          throw new Error(`intelligence_clusters[${idx}].cluster_name invalid: ${cl.cluster_name}`);
      });
    }
    // Validate edge shape when edges exist
    dt.knowledge_graph.edges.forEach((e, idx) => {
      const edgeFields = ['from','to','type','strength','reason','analysis'];
      edgeFields.forEach(f => {
        if (!(f in e)) throw new Error(`knowledge_graph.edges[${idx}] missing field: ${f}`);
      });
      const VALID_TYPES = ['SIMILAR_TO','SAME_INDUSTRY','SHARED_FEATURES','SHARED_RISKS','SHARED_OPPORTUNITIES'];
      if (!VALID_TYPES.includes(e.type))
        throw new Error(`knowledge_graph.edges[${idx}].type invalid: ${e.type}`);
      if (typeof e.strength !== 'number' || e.strength < 0 || e.strength > 100)
        throw new Error(`knowledge_graph.edges[${idx}].strength out of range: ${e.strength}`);
      // Validate analysis.similarity_breakdown
      if (!e.analysis || typeof e.analysis !== 'object')
        throw new Error(`knowledge_graph.edges[${idx}].analysis missing or invalid.`);
      const sb = e.analysis.similarity_breakdown;
      if (!sb || typeof sb !== 'object')
        throw new Error(`knowledge_graph.edges[${idx}].analysis.similarity_breakdown missing.`);
      ['features','business','technical','market'].forEach(dim => {
        if (typeof sb[dim] !== 'number' || sb[dim] < 0 || sb[dim] > 100)
          throw new Error(`knowledge_graph.edges[${idx}].similarity_breakdown.${dim} invalid: ${sb[dim]}`);
      });
    });
  }
  // semantic_memory — optional (absent on legacy records before v5.0)
  if (dt.semantic_memory !== undefined) {
    const sm = dt.semantic_memory;
    if (typeof sm.meaning_vector !== 'string')
      throw new Error('digital_twin.semantic_memory.meaning_vector must be a string.');
    if (!Array.isArray(sm.concept_tags))
      throw new Error('digital_twin.semantic_memory.concept_tags must be an array.');
    if (typeof sm.functional_identity !== 'string')
      throw new Error('digital_twin.semantic_memory.functional_identity must be a string.');
    const VALID_ROLES = ['core_system','support_tool','ai_agent_system','automation_system','business_platform','experimental_system'];
    if (!VALID_ROLES.includes(sm.strategic_role))
      throw new Error(`digital_twin.semantic_memory.strategic_role invalid: ${sm.strategic_role}`);
  }
  // cross_project_reasoning — optional (absent on legacy records before v6.0)
  if (dt.cross_project_reasoning !== undefined) {
    const cpr = dt.cross_project_reasoning;
    if (!Array.isArray(cpr.strongest_projects))
      throw new Error('cross_project_reasoning.strongest_projects must be an array.');
    if (!Array.isArray(cpr.weakest_projects))
      throw new Error('cross_project_reasoning.weakest_projects must be an array.');
    if (!Array.isArray(cpr.repeated_patterns))
      throw new Error('cross_project_reasoning.repeated_patterns must be an array.');
    if (!cpr.skill_dominance_map || typeof cpr.skill_dominance_map !== 'object')
      throw new Error('cross_project_reasoning.skill_dominance_map must be an object.');
    const sdmKeys = ['technical','business','architecture','ai_systems'];
    sdmKeys.forEach(k => {
      if (typeof cpr.skill_dominance_map[k] !== 'number')
        throw new Error(`cross_project_reasoning.skill_dominance_map.${k} must be a number.`);
    });
    if (typeof cpr.portfolio_summary !== 'string')
      throw new Error('cross_project_reasoning.portfolio_summary must be a string.');
  }
  // portfolio_intelligence_report — optional (absent on legacy records before v7.0)
  if (dt.portfolio_intelligence_report !== undefined) {
    const pir = dt.portfolio_intelligence_report;
    if (typeof pir.overview !== 'string')
      throw new Error('portfolio_intelligence_report.overview must be a string.');
    if (!pir.project_distribution || typeof pir.project_distribution !== 'object')
      throw new Error('portfolio_intelligence_report.project_distribution must be an object.');
    ['ai_systems','automation_tools','business_systems','experimental'].forEach(k => {
      if (typeof pir.project_distribution[k] !== 'number')
        throw new Error(`portfolio_intelligence_report.project_distribution.${k} must be a number.`);
    });
    if (typeof pir.technical_strength_analysis !== 'string')
      throw new Error('portfolio_intelligence_report.technical_strength_analysis must be a string.');
    if (typeof pir.innovation_score !== 'number' || pir.innovation_score < 0 || pir.innovation_score > 100)
      throw new Error('portfolio_intelligence_report.innovation_score must be 0-100.');
    if (typeof pir.consistency_score !== 'number' || pir.consistency_score < 0 || pir.consistency_score > 100)
      throw new Error('portfolio_intelligence_report.consistency_score must be 0-100.');
    if (typeof pir.portfolio_identity !== 'string')
      throw new Error('portfolio_intelligence_report.portfolio_identity must be a string.');
    if (!Array.isArray(pir.key_strengths))
      throw new Error('portfolio_intelligence_report.key_strengths must be an array.');
    if (!Array.isArray(pir.key_gaps))
      throw new Error('portfolio_intelligence_report.key_gaps must be an array.');
  }
  // portfolio_visual_map — optional (absent on legacy records before v8.0)
  if (dt.portfolio_visual_map !== undefined) {
    const pvm = dt.portfolio_visual_map;
    if (!Array.isArray(pvm.nodes))
      throw new Error('portfolio_visual_map.nodes must be an array.');
    if (!Array.isArray(pvm.connections))
      throw new Error('portfolio_visual_map.connections must be an array.');
    if (!Array.isArray(pvm.clusters))
      throw new Error('portfolio_visual_map.clusters must be an array.');
    // Validate node shape (first entry only — cost guard)
    if (pvm.nodes.length > 0) {
      const n = pvm.nodes[0];
      if (typeof n.id !== 'string')
        throw new Error('portfolio_visual_map.nodes[0].id must be a string.');
      if (typeof n.label !== 'string')
        throw new Error('portfolio_visual_map.nodes[0].label must be a string.');
      if (typeof n.importance_score !== 'number')
        throw new Error('portfolio_visual_map.nodes[0].importance_score must be a number.');
      if (typeof n.strategic_role !== 'string')
        throw new Error('portfolio_visual_map.nodes[0].strategic_role must be a string.');
    }
    // Validate connection shape (first entry only)
    if (pvm.connections.length > 0) {
      const c = pvm.connections[0];
      if (typeof c.from !== 'string' || typeof c.to !== 'string')
        throw new Error('portfolio_visual_map.connections[0].from/to must be strings.');
      if (typeof c.strength !== 'number' || c.strength < 0 || c.strength > 100)
        throw new Error('portfolio_visual_map.connections[0].strength must be 0-100.');
    }
    // Validate cluster shape (first entry only)
    if (pvm.clusters.length > 0) {
      const cl = pvm.clusters[0];
      if (typeof cl.cluster_name !== 'string')
        throw new Error('portfolio_visual_map.clusters[0].cluster_name must be a string.');
      if (!Array.isArray(cl.projects))
        throw new Error('portfolio_visual_map.clusters[0].projects must be an array.');
    }
  }
  // reasoning_trace — optional (absent on legacy records before v9.0)
  if (dt.reasoning_trace !== undefined) {
    const rt = dt.reasoning_trace;
    if (!Array.isArray(rt.key_signals_detected))
      throw new Error('reasoning_trace.key_signals_detected must be an array.');
    if (!Array.isArray(rt.decision_path))
      throw new Error('reasoning_trace.decision_path must be an array.');
    if (!Array.isArray(rt.confidence_drivers))
      throw new Error('reasoning_trace.confidence_drivers must be an array.');
    if (!Array.isArray(rt.assumptions_made))
      throw new Error('reasoning_trace.assumptions_made must be an array.');
    if (typeof rt.final_reasoning_summary !== 'string')
      throw new Error('reasoning_trace.final_reasoning_summary must be a string.');
  }
  // confidence_model — optional (absent on legacy records before v10.0)
  if (dt.confidence_model !== undefined) {
    const cm = dt.confidence_model;
    if (typeof cm.overall_confidence !== 'number' || cm.overall_confidence < 0 || cm.overall_confidence > 100)
      throw new Error('confidence_model.overall_confidence must be a number 0-100.');
    if (!cm.field_confidence || typeof cm.field_confidence !== 'object')
      throw new Error('confidence_model.field_confidence must be an object.');
    const FC_FIELDS = ['business_model','technical_analysis','investor_readiness','risk_analysis'];
    FC_FIELDS.forEach(f => {
      if (typeof cm.field_confidence[f] !== 'number' || cm.field_confidence[f] < 0 || cm.field_confidence[f] > 100)
        throw new Error('confidence_model.field_confidence.' + f + ' must be a number 0-100.');
    });
    if (!Array.isArray(cm.uncertainty_flags))
      throw new Error('confidence_model.uncertainty_flags must be an array.');
    if (!Array.isArray(cm.low_confidence_areas))
      throw new Error('confidence_model.low_confidence_areas must be an array.');
    if (typeof cm.reliability_summary !== 'string')
      throw new Error('confidence_model.reliability_summary must be a string.');
  }
  // comparison_engine — optional (absent when < 2 projects in portfolio)
  if (dt.comparison_engine !== undefined) {
    const ce = dt.comparison_engine;
    if (!Array.isArray(ce.comparison_pairs))
      throw new Error('comparison_engine.comparison_pairs must be an array.');
    ce.comparison_pairs.forEach((pair, idx) => {
      if (typeof pair.project_a !== 'string')
        throw new Error('comparison_engine.comparison_pairs[' + idx + '].project_a must be a string.');
      if (typeof pair.project_b !== 'string')
        throw new Error('comparison_engine.comparison_pairs[' + idx + '].project_b must be a string.');
      if (typeof pair.comparison_summary !== 'string')
        throw new Error('comparison_engine.comparison_pairs[' + idx + '].comparison_summary must be a string.');
      if (!pair.winner_by_category || typeof pair.winner_by_category !== 'object')
        throw new Error('comparison_engine.comparison_pairs[' + idx + '].winner_by_category must be an object.');
      if (!Array.isArray(pair.key_differences))
        throw new Error('comparison_engine.comparison_pairs[' + idx + '].key_differences must be an array.');
      if (typeof pair.similarity_score !== 'number' || pair.similarity_score < 0 || pair.similarity_score > 100)
        throw new Error('comparison_engine.comparison_pairs[' + idx + '].similarity_score must be 0-100.');
    });
  }
  // builder_profile — optional (absent when no projects have been analysed)
  if (dt.builder_profile !== undefined) {
    const bp = dt.builder_profile;
    if (!Array.isArray(bp.dominant_skills))
      throw new Error('builder_profile.dominant_skills must be an array.');
    if (typeof bp.technical_identity !== 'string')
      throw new Error('builder_profile.technical_identity must be a string.');
    if (typeof bp.system_building_style !== 'string')
      throw new Error('builder_profile.system_building_style must be a string.');
    if (!Array.isArray(bp.strongest_domains))
      throw new Error('builder_profile.strongest_domains must be an array.');
    if (!Array.isArray(bp.innovation_pattern))
      throw new Error('builder_profile.innovation_pattern must be an array.');
    if (!Array.isArray(bp.architecture_preferences))
      throw new Error('builder_profile.architecture_preferences must be an array.');
    if (!Array.isArray(bp.recurring_patterns))
      throw new Error('builder_profile.recurring_patterns must be an array.');
    if (!bp.skill_scores || typeof bp.skill_scores !== 'object')
      throw new Error('builder_profile.skill_scores must be an object.');
    const BP_SCORE_FIELDS = ['frontend','backend','ai_systems','architecture','product_design'];
    BP_SCORE_FIELDS.forEach(f => {
      if (typeof bp.skill_scores[f] !== 'number' || bp.skill_scores[f] < 0 || bp.skill_scores[f] > 100)
        throw new Error('builder_profile.skill_scores.' + f + ' must be 0-100.');
    });
    if (typeof bp.overall_builder_summary !== 'string')
      throw new Error('builder_profile.overall_builder_summary must be a string.');
  }
  // evolution_tracker — optional (absent on first project, present after)
  if (dt.evolution_tracker !== undefined) {
    const et = dt.evolution_tracker;
    if (!Array.isArray(et.project_progression))
      throw new Error('evolution_tracker.project_progression must be an array.');
    et.project_progression.forEach((entry, idx) => {
      if (typeof entry.timestamp !== 'string')
        throw new Error('evolution_tracker.project_progression[' + idx + '].timestamp must be a string.');
      if (typeof entry.complexity_level !== 'string')
        throw new Error('evolution_tracker.project_progression[' + idx + '].complexity_level must be a string.');
      if (typeof entry.intelligence_depth !== 'number')
        throw new Error('evolution_tracker.project_progression[' + idx + '].intelligence_depth must be a number.');
      if (typeof entry.feature_maturity !== 'string')
        throw new Error('evolution_tracker.project_progression[' + idx + '].feature_maturity must be a string.');
      if (typeof entry.notes !== 'string')
        throw new Error('evolution_tracker.project_progression[' + idx + '].notes must be a string.');
    });
    if (typeof et.portfolio_evolution_summary !== 'string')
      throw new Error('evolution_tracker.portfolio_evolution_summary must be a string.');
    if (typeof et.skill_growth_trend !== 'string')
      throw new Error('evolution_tracker.skill_growth_trend must be a string.');
    if (typeof et.system_maturity_score !== 'number' || et.system_maturity_score < 0 || et.system_maturity_score > 100)
      throw new Error('evolution_tracker.system_maturity_score must be a number 0-100.');
  }
  // what_if_engine — optional (absent on migration, present after Phase 14)
  if (dt.what_if_engine !== undefined) {
    const wi = dt.what_if_engine;
    if (!Array.isArray(wi.scenarios))
      throw new Error('what_if_engine.scenarios must be an array.');
    wi.scenarios.forEach((sc, idx) => {
      if (typeof sc.scenario !== 'string' || !sc.scenario.startsWith('[HYPOTHETICAL]'))
        throw new Error('what_if_engine.scenarios[' + idx + '].scenario must be a [HYPOTHETICAL]-prefixed string.');
      if (typeof sc.outcome_prediction !== 'string')
        throw new Error('what_if_engine.scenarios[' + idx + '].outcome_prediction must be a string.');
      if (!Array.isArray(sc.risk_factors))
        throw new Error('what_if_engine.scenarios[' + idx + '].risk_factors must be an array.');
      if (!Array.isArray(sc.opportunity_factors))
        throw new Error('what_if_engine.scenarios[' + idx + '].opportunity_factors must be an array.');
      if (typeof sc.feasibility_score !== 'number' || sc.feasibility_score < 0 || sc.feasibility_score > 100)
        throw new Error('what_if_engine.scenarios[' + idx + '].feasibility_score must be 0-100.');
    });
  }
  return true;
}

// ═══════════════════════════════════════════════════
// SECTION 3 — Content Extraction (unchanged from v1.2)
// ═══════════════════════════════════════════════════
const _extractCache = new Map();
const EXTRACT_TTL   = 5 * 60 * 1000;

async function extractContent(url) {
  const cached = _extractCache.get(url);
  if (cached && (Date.now() - cached.ts) < EXTRACT_TTL) return cached.content;

  // Dual proxy chain: allorigins (primary) → corsproxy.io (fallback)
  const PROXIES = [
    (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  ];

  let rawHtml = null;
  let lastErr  = 'Unable to fetch website.';

  for (const proxyFn of PROXIES) {
    try {
      const proxyUrl = proxyFn(url);
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(18000) });
      if (!res.ok) { lastErr = `Proxy returned ${res.status}`; continue; }
      // allorigins returns { contents: '...' }; corsproxy returns raw HTML
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const json = await res.json().catch(() => null);
        if (json?.contents && json.contents.length >= 50) { rawHtml = json.contents; break; }
        lastErr = 'Proxy returned empty content'; continue;
      } else {
        const text = await res.text().catch(() => null);
        if (text && text.length >= 50) { rawHtml = text; break; }
        lastErr = 'Proxy returned empty content'; continue;
      }
    } catch (e) { lastErr = e.message; continue; }
  }

  if (!rawHtml) throw new Error('Unable to fetch website — ' + lastErr + '. Check the URL or try again.');

  const parser = new DOMParser();
  const doc    = parser.parseFromString(rawHtml, 'text/html');

  const NOISE = [
    'script','style','noscript','nav','footer','header','aside',
    'iframe','svg','canvas','video','audio','picture','source',
    'form','input','button','select','textarea','label',
    '[class*="cookie"]','[class*="popup"]','[class*="banner"]',
    '[class*="modal"]','[class*="overlay"]','[class*="ad-"]',
    '[id*="cookie"]','[id*="popup"]','[id*="banner"]'
  ];
  NOISE.forEach(sel => { try { doc.querySelectorAll(sel).forEach(el => el.remove()); } catch {} });

  const getAttr = (sel, attr) => doc.querySelector(sel)?.getAttribute(attr)?.trim() || '';
  const getText = (sel)       => doc.querySelector(sel)?.textContent?.trim() || '';

  const title       = getAttr('meta[property="og:title"]','content') || getText('title') || domainOf(url);
  const description = getAttr('meta[name="description"]','content')
                   || getAttr('meta[property="og:description"]','content') || '';

  const headingSet = new Set();
  const headings   = [];
  doc.querySelectorAll('h1,h2,h3').forEach(h => {
    const t = h.textContent.replace(/\s+/g,' ').trim();
    if (t.length >= 3 && t.length <= 160 && !headingSet.has(t.toLowerCase())) {
      headingSet.add(t.toLowerCase()); headings.push(t);
    }
  });

  const seenText = new Set();
  const textBits = [];
  doc.querySelectorAll('p,li,td,dd,blockquote,[class*="content"],[class*="text"],[class*="desc"]').forEach(el => {
    const t = el.textContent.replace(/\s+/g,' ').trim();
    const k = t.toLowerCase().slice(0,80);
    if (t.length >= 40 && t.length <= 800 && !seenText.has(k)) { seenText.add(k); textBits.push(t); }
  });

  const content = {
    title,
    description: description.slice(0, 300),
    headings:    headings.slice(0, 20),
    body:        textBits.join(' ').slice(0, 5800),
  };
  _extractCache.set(url, { content, ts: Date.now() });
  return content;
}


// ═══════════════════════════════════════════════════
// SECTION 4 — Phase 2 Intelligence Schema
// ═══════════════════════════════════════════════════

// ── Phase 1 keys (backward compat — always present) ──
const P1_KEYS = [
  'project_name','project_summary','features',
  'business_model','target_audience',
  'technical_signals','improvements','investor_summary',
];

// ── Phase 4: Competitor analysis keys ──
const COMPETITOR_KEYS = ['competitor_analysis'];

// ── Phase 5: Insight Generation keys ──
const INSIGHT_KEYS = ['insight_summary'];

// ── Phase 3: Multi-Agent Intelligence keys ──
const MULTI_AGENT_KEYS = ['multi_agent_intelligence'];

// ── Fusion Layer: Intelligence Fusion keys ──
const FUSION_KEYS = ['intelligence_fusion'];

// ── Decision Engine keys ──
const DECISION_KEYS = ['decision_engine'];

// ── Cross-Project Intelligence Memory keys ──
const CROSS_KEYS = ['cross_project_links'];

// ── Phase 4: Knowledge Graph keys ──
const GRAPH_KEYS = ['knowledge_graph'];

// ── Phase 5: Semantic Memory keys ──
const SEMANTIC_KEYS = ['semantic_memory'];

// ── Phase 6: Cross-Project Reasoning keys ──
const REASONING_KEYS = ['cross_project_reasoning'];

// ── Phase 7: Portfolio Intelligence Report keys ──
const PORTFOLIO_KEYS = ['portfolio_intelligence_report'];

// ── Phase 8: Portfolio Visual Map keys ──
const VISUAL_MAP_KEYS = ['portfolio_visual_map'];

// ── Phase 9 (Reasoning Layer): Reasoning Trace keys ──
const TRACE_KEYS = ['reasoning_trace'];

// ── Phase 10: Confidence & Uncertainty Model keys ──
const CONFIDENCE_KEYS = ['confidence_model'];

// ── Phase 11: Project Comparison Engine keys ──
const COMPARISON_KEYS = ['comparison_engine'];

// ── Phase 12: Builder Profile Intelligence Engine keys ──
const BUILDER_KEYS = ['builder_profile'];

// ── Phase 13: System Evolution Tracking Layer keys ──
const EVOLUTION_KEYS = ['evolution_tracker'];

// ── Phase 14: What-If Simulation Engine keys ──
const WHATIF_KEYS = ['what_if_engine'];

// ── Phase 3: Scoring keys ──
const SCORE_KEYS = [
  'business_score',
  'technical_score',
  'investor_score',
  'scalability_score',
  'innovation_score',
];

// ── Phase 2 report keys ──
const P2_KEYS = [
  'report_overview',
  'report_business',
  'report_technical',
  'report_investor',
  'report_roadmap',
];

const ALL_SCHEMA_KEYS = [...P1_KEYS, ...P2_KEYS, ...SCORE_KEYS, ...COMPETITOR_KEYS, ...INSIGHT_KEYS, ...MULTI_AGENT_KEYS, ...FUSION_KEYS, ...DECISION_KEYS, ...CROSS_KEYS, ...GRAPH_KEYS, ...SEMANTIC_KEYS, ...REASONING_KEYS, ...PORTFOLIO_KEYS, ...VISUAL_MAP_KEYS, ...TRACE_KEYS, ...CONFIDENCE_KEYS, ...COMPARISON_KEYS, ...BUILDER_KEYS, ...EVOLUTION_KEYS, ...WHATIF_KEYS];

// ── Phase 2 fallbacks ──
const P2_FALLBACK = {
  report_overview: {
    what_it_is:    'Unable to determine.',
    what_it_does:  'Unable to determine.',
    who_it_serves: 'Unable to determine.',
  },
  report_business: {
    revenue_model:     'Unknown',
    monetisation:      'Unknown',
    market_type:       'Unknown',
    customer_segments: ['Unknown'],
  },
  report_technical: {
    stack_signals:            ['No signals detected.'],
    architecture_assumptions: 'Insufficient data.',
    complexity_level:         'Unknown',
    scalability_notes:        'Insufficient data.',
  },
  report_investor: {
    value_proposition: 'Insufficient data.',
    market_opportunity:'Insufficient data.',
    risk_level:        'Unknown',
    growth_potential:  'Unknown',
  },
  report_roadmap: {
    immediate_fixes:       ['Insufficient data.'],
    growth_opportunities:  ['Insufficient data.'],
    feature_suggestions:   ['Insufficient data.'],
  },
};

// ── Phase 1 fallback (unchanged) ──
const P1_FALLBACK = {
  project_name:      'Unknown Project',
  project_summary:   'Analysis could not be completed for this page.',
  features:          ['Unable to extract features from this page.'],
  business_model:    'Unknown',
  target_audience:   'Unknown',
  technical_signals: ['No technical signals detected.'],
  improvements:      ['Retry with a more content-rich URL.'],
  investor_summary:  'Insufficient data for an investor summary.',
};

const SCORE_FALLBACK = {
  business_score:    0,
  technical_score:   0,
  investor_score:    0,
  scalability_score: 0,
  innovation_score:  0,
};

const COMPETITOR_FALLBACK = {
  competitor_analysis: {
    possible_competitors:    ['assumed category match'],
    market_position:         'assumed category match',
    differentiation_points:  ['assumed category match'],
    weakness_vs_market:      ['assumed category match'],
  },
};

const INSIGHT_FALLBACK = {
  insight_summary: {
    strengths:            ['Insufficient data.', 'Insufficient data.', 'Insufficient data.'],
    risks:                ['Insufficient data.', 'Insufficient data.', 'Insufficient data.'],
    growth_opportunities: ['Insufficient data.', 'Insufficient data.', 'Insufficient data.'],
    verdict:              'Insufficient data to generate a verdict.',
  },
};

const MULTI_AGENT_FALLBACK = {
  multi_agent_intelligence: {
    research:  { industry: 'Unknown', category: 'Unknown', purpose: 'Unable to determine.', context_summary: 'Insufficient data.' },
    business:  { monetisation_model: 'Unknown', revenue_streams: ['Unable to determine.'], pricing_signals: 'Unknown', opportunity_rating: 'Unknown' },
    technical: { inferred_stack: ['Unable to determine.'], architecture_type: 'Unknown', complexity_rating: 'Unknown', scalability_assessment: 'Insufficient data.' },
    investor:  { funding_potential: 'Unknown', market_opportunity: 'Insufficient data.', investment_signals: ['Unable to determine.'], valuation_indicators: 'Unknown' },
    risk:      { key_risks: ['Unable to determine.'], operational_concerns: ['Unable to determine.'], market_risks: ['Unable to determine.'], overall_risk_level: 'Unknown' },
    growth:    { scaling_opportunities: ['Unable to determine.'], expansion_ideas: ['Unable to determine.'], partnership_potential: 'Unknown', growth_trajectory: 'Unknown' },
  },
};

const FUSION_FALLBACK = {
  intelligence_fusion: {
    unified_summary:             'Insufficient agent data to generate a unified summary.',
    key_insights:                ['Insufficient data.'],
    contradictions:              ['No contradictions detected.'],
    strongest_opportunities:     ['Insufficient data.'],
    biggest_risks:               ['Insufficient data.'],
    overall_intelligence_score:  0,
  },
};

const DECISION_FALLBACK = {
  decision_engine: {
    viability:            'low',
    recommendation:       'Insufficient intelligence data to generate a recommendation.',
    build_recommendation: 'avoid',
    confidence_score:     0,
    reasoning_summary:    'Decision engine could not produce a result — all scores defaulted to zero.',
  },
};

const CROSS_FALLBACK = {
  cross_project_links: {
    similar_projects: [],
    shared_patterns:  ['No patterns detected — insufficient project history.'],
    market_clusters:  ['Unclustered'],
  },
};

const GRAPH_FALLBACK = {
  knowledge_graph: {
    nodes: [],
    edges: [],
    intelligence_clusters: [],
    graph_visualisation_data: { nodes: [], edges: [] },
  },
};

const SEMANTIC_FALLBACK = {
  semantic_memory: {
    meaning_vector:      '',
    concept_tags:        [],
    functional_identity: '',
    strategic_role:      'experimental_system',
  },
};

const REASONING_FALLBACK = {
  cross_project_reasoning: {
    strongest_projects:   [],
    weakest_projects:     [],
    repeated_patterns:    [],
    skill_dominance_map:  { technical: 0, business: 0, architecture: 0, ai_systems: 0 },
    portfolio_summary:    '',
  },
};

const PORTFOLIO_FALLBACK = {
  portfolio_intelligence_report: {
    overview:                   '',
    project_distribution:       { ai_systems: 0, automation_tools: 0, business_systems: 0, experimental: 0 },
    technical_strength_analysis:'',
    innovation_score:           0,
    consistency_score:          0,
    portfolio_identity:         '',
    key_strengths:              [],
    key_gaps:                   [],
  },
};

const VISUAL_MAP_FALLBACK = {
  portfolio_visual_map: {
    nodes:       [],
    connections: [],
    clusters:    [],
  },
};

const TRACE_FALLBACK = {
  reasoning_trace: {
    key_signals_detected:    [],
    decision_path:           [],
    confidence_drivers:      [],
    assumptions_made:        [],
    final_reasoning_summary: '',
  },
};

const CONFIDENCE_FALLBACK = {
  confidence_model: {
    overall_confidence:  0,
    field_confidence: {
      business_model:      0,
      technical_analysis:  0,
      investor_readiness:  0,
      risk_analysis:       0,
    },
    uncertainty_flags:    [],
    low_confidence_areas: [],
    reliability_summary:  '',
  },
};

const COMPARISON_FALLBACK = {
  comparison_engine: {
    comparison_pairs: [],
  },
};

const BUILDER_FALLBACK = {
  builder_profile: {
    dominant_skills:           [],
    technical_identity:        '',
    system_building_style:     '',
    strongest_domains:         [],
    innovation_pattern:        [],
    architecture_preferences:  [],
    recurring_patterns:        [],
    skill_scores: {
      frontend:       0,
      backend:        0,
      ai_systems:     0,
      architecture:   0,
      product_design: 0,
    },
    overall_builder_summary:   '',
  },
};

const EVOLUTION_FALLBACK = {
  evolution_tracker: {
    project_progression:          [],
    portfolio_evolution_summary:  '',
    skill_growth_trend:           '',
    system_maturity_score:        0,
  },
};

const WHATIF_FALLBACK = {
  what_if_engine: {
    scenarios: [],
  },
};

const AI_FALLBACK = { ...P1_FALLBACK, ...P2_FALLBACK, ...SCORE_FALLBACK, ...COMPETITOR_FALLBACK, ...INSIGHT_FALLBACK, ...MULTI_AGENT_FALLBACK, ...FUSION_FALLBACK, ...DECISION_FALLBACK, ...CROSS_FALLBACK, ...GRAPH_FALLBACK, ...SEMANTIC_FALLBACK, ...REASONING_FALLBACK, ...PORTFOLIO_FALLBACK, ...VISUAL_MAP_FALLBACK, ...TRACE_FALLBACK, ...CONFIDENCE_FALLBACK, ...COMPARISON_FALLBACK, ...BUILDER_FALLBACK, ...EVOLUTION_FALLBACK, ...WHATIF_FALLBACK };


// ═══════════════════════════════════════════════════
// SECTION 5 — AI Engine (Phase 2 prompt + coercion)
// ═══════════════════════════════════════════════════

function buildPrompt(content, url) {
  return `You are AP3XVER5E — an AI Project Intelligence Engine.
Analyse this web content from: ${url}

---
TITLE: ${content.title}
META: ${content.description}
HEADINGS: ${content.headings.slice(0, 12).join(' | ')}
CONTENT: ${content.body.slice(0, 3600)}
---

Return ONLY a single valid JSON object. No markdown. No code fences. No explanation. No extra keys.
Match this EXACT structure (every key required):

{
  "project_name": "<1-5 word product name>",
  "project_summary": "<2-3 sentence plain-English summary>",
  "features": ["<feature>","<feature>","<feature>","<feature>","<feature>"],
  "business_model": "<one sentence on monetisation>",
  "target_audience": "<one sentence on who this is for>",
  "technical_signals": ["<signal>","<signal>","<signal>"],
  "improvements": ["<improvement>","<improvement>","<improvement>"],
  "investor_summary": "<2-3 sentence investor-ready pitch>",

  "report_overview": {
    "what_it_is":    "<one sentence definition>",
    "what_it_does":  "<one sentence functional description>",
    "who_it_serves": "<one sentence audience definition>"
  },

  "report_business": {
    "revenue_model":     "<primary revenue model, e.g. SaaS subscription, ads, marketplace>",
    "monetisation":      "<how money is extracted from users or the market>",
    "market_type":       "<e.g. B2B, B2C, B2B2C, marketplace>",
    "customer_segments": ["<segment>","<segment>"]
  },

  "report_technical": {
    "stack_signals":            ["<detected tech>","<detected tech>","<detected tech>"],
    "architecture_assumptions": "<inferred architecture, e.g. monolith, microservices, JAMstack>",
    "complexity_level":         "<Low | Medium | High>",
    "scalability_notes":        "<one sentence on scalability posture>"
  },

  "report_investor": {
    "value_proposition": "<core value prop in one sentence>",
    "market_opportunity":"<addressable market signal in one sentence>",
    "risk_level":        "<Low | Medium | High>",
    "growth_potential":  "<Low | Medium | High — with one sentence rationale>"
  },

  "report_roadmap": {
    "immediate_fixes":      ["<fix>","<fix>","<fix>"],
    "growth_opportunities": ["<opportunity>","<opportunity>","<opportunity>"],
    "feature_suggestions":  ["<feature>","<feature>","<feature>"]
  },

  "business_score":    <integer 0-100: clarity of business model, revenue streams, and market fit>,
  "technical_score":   <integer 0-100: technical sophistication, stack maturity, architecture quality>,
  "investor_score":    <integer 0-100: investment attractiveness, value prop clarity, growth signals>,
  "scalability_score": <integer 0-100: capacity to scale users, revenue, and infrastructure>,
  "innovation_score":  <integer 0-100: originality, differentiation, and novelty of approach>,

  "competitor_analysis": {
    "possible_competitors":   ["<inferred competitor or platform name>","<inferred competitor>","<inferred competitor>"],
    "market_position":        "<inferred market position — e.g. challenger, niche leader, early-stage, commodity>",
    "differentiation_points": ["<what sets this apart from inferred competitors>","<differentiation point>","<differentiation point>"],
    "weakness_vs_market":     ["<inferred weakness relative to market>","<weakness>","<weakness>"]
  },

  "insight_summary": {
    "strengths":            ["<key strength derived from all analysis above>","<key strength>","<key strength>"],
    "risks":                ["<key risk derived from all analysis above>","<key risk>","<key risk>"],
    "growth_opportunities": ["<growth opportunity derived from roadmap and market analysis>","<opportunity>","<opportunity>"],
    "verdict":              "<one concise sentence overall verdict on this project — its current standing and highest-priority action>"
  }
}`;
}

function parseAIResponse(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let cleaned = raw
    .replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/\s*```$/,'').trim();
  const s = cleaned.indexOf('{');
  const e = cleaned.lastIndexOf('}');
  if (s === -1 || e === -1 || e <= s) return null;
  cleaned = cleaned.slice(s, e + 1);
  let parsed;
  try { parsed = JSON.parse(cleaned); } catch { return null; }
  // multi_agent_intelligence + intelligence_fusion injected post-parse — exclude both
  const PARSE_REQUIRED_KEYS = ALL_SCHEMA_KEYS.filter(k => !MULTI_AGENT_KEYS.includes(k) && !FUSION_KEYS.includes(k) && !DECISION_KEYS.includes(k) && !CROSS_KEYS.includes(k) && !GRAPH_KEYS.includes(k) && !SEMANTIC_KEYS.includes(k) && !REASONING_KEYS.includes(k) && !PORTFOLIO_KEYS.includes(k) && !VISUAL_MAP_KEYS.includes(k) && !TRACE_KEYS.includes(k) && !CONFIDENCE_KEYS.includes(k) && !COMPARISON_KEYS.includes(k) && !BUILDER_KEYS.includes(k) && !EVOLUTION_KEYS.includes(k) && !WHATIF_KEYS.includes(k));
  for (const k of PARSE_REQUIRED_KEYS) {
    if (!(k in parsed)) return null;
  }
  // Guard nested objects — reject if any report/insight/competitor is not an object
  const nestedKeys = [...P2_KEYS, ...COMPETITOR_KEYS, ...INSIGHT_KEYS];
  for (const k of nestedKeys) {
    if (typeof parsed[k] !== 'object' || Array.isArray(parsed[k]) || parsed[k] === null) return null;
  }
  // Guard scores — reject if any score is not a number-like value
  for (const k of SCORE_KEYS) {
    if (isNaN(parseInt(parsed[k], 10))) return null;
  }
  return parsed;
}

// Coerce every field to the right type — no missing fields ever stored
function coerceAnalysis(raw) {
  // Clamp a raw value to an integer 0-100; fallback 0 on bad input
  const score = (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n)) return 0;
    return Math.min(100, Math.max(0, n));
  };
  const str  = (v, fb) => (typeof v === 'string' && v.trim()) ? v.trim() : fb;
  const arr  = (v, fb) => {
    if (!Array.isArray(v) || !v.length) return fb;
    const a = v.filter(i => typeof i === 'string' && i.trim()).map(i => i.trim());
    return a.length ? a : fb;
  };
  const obj  = (v, fb) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : fb;

  const fb   = AI_FALLBACK;

  return {
    // ── Phase 1 fields ──
    project_name:      str(raw?.project_name,      fb.project_name),
    project_summary:   str(raw?.project_summary,   fb.project_summary),
    features:          arr(raw?.features,           fb.features),
    business_model:    str(raw?.business_model,    fb.business_model),
    target_audience:   str(raw?.target_audience,   fb.target_audience),
    technical_signals: arr(raw?.technical_signals, fb.technical_signals),
    improvements:      arr(raw?.improvements,      fb.improvements),
    investor_summary:  str(raw?.investor_summary,  fb.investor_summary),

    // ── Phase 2: Report 1 — Project Overview ──
    report_overview: {
      what_it_is:    str(obj(raw?.report_overview, {})?.what_it_is,    fb.report_overview.what_it_is),
      what_it_does:  str(obj(raw?.report_overview, {})?.what_it_does,  fb.report_overview.what_it_does),
      who_it_serves: str(obj(raw?.report_overview, {})?.who_it_serves, fb.report_overview.who_it_serves),
    },

    // ── Phase 2: Report 2 — Business Intelligence ──
    report_business: {
      revenue_model:     str(obj(raw?.report_business, {})?.revenue_model,     fb.report_business.revenue_model),
      monetisation:      str(obj(raw?.report_business, {})?.monetisation,      fb.report_business.monetisation),
      market_type:       str(obj(raw?.report_business, {})?.market_type,       fb.report_business.market_type),
      customer_segments: arr(obj(raw?.report_business, {})?.customer_segments, fb.report_business.customer_segments),
    },

    // ── Phase 2: Report 3 — Technical Intelligence ──
    report_technical: {
      stack_signals:            arr(obj(raw?.report_technical, {})?.stack_signals,            fb.report_technical.stack_signals),
      architecture_assumptions: str(obj(raw?.report_technical, {})?.architecture_assumptions, fb.report_technical.architecture_assumptions),
      complexity_level:         str(obj(raw?.report_technical, {})?.complexity_level,         fb.report_technical.complexity_level),
      scalability_notes:        str(obj(raw?.report_technical, {})?.scalability_notes,        fb.report_technical.scalability_notes),
    },

    // ── Phase 2: Report 4 — Investor Readiness ──
    report_investor: {
      value_proposition:  str(obj(raw?.report_investor, {})?.value_proposition,  fb.report_investor.value_proposition),
      market_opportunity: str(obj(raw?.report_investor, {})?.market_opportunity, fb.report_investor.market_opportunity),
      risk_level:         str(obj(raw?.report_investor, {})?.risk_level,         fb.report_investor.risk_level),
      growth_potential:   str(obj(raw?.report_investor, {})?.growth_potential,   fb.report_investor.growth_potential),
    },

    // ── Phase 2: Report 5 — Improvement Roadmap ──
    report_roadmap: {
      immediate_fixes:      arr(obj(raw?.report_roadmap, {})?.immediate_fixes,      fb.report_roadmap.immediate_fixes),
      growth_opportunities: arr(obj(raw?.report_roadmap, {})?.growth_opportunities, fb.report_roadmap.growth_opportunities),
      feature_suggestions:  arr(obj(raw?.report_roadmap, {})?.feature_suggestions,  fb.report_roadmap.feature_suggestions),
    },

    // ── Phase 3: Scores ──
    business_score:    score(raw?.business_score),
    technical_score:   score(raw?.technical_score),
    investor_score:    score(raw?.investor_score),
    scalability_score: score(raw?.scalability_score),
    innovation_score:  score(raw?.innovation_score),

    // ── Phase 4: Competitor Analysis ──
    competitor_analysis: {
      possible_competitors:   arr(obj(raw?.competitor_analysis, {})?.possible_competitors,   COMPETITOR_FALLBACK.competitor_analysis.possible_competitors),
      market_position:        str(obj(raw?.competitor_analysis, {})?.market_position,        COMPETITOR_FALLBACK.competitor_analysis.market_position),
      differentiation_points: arr(obj(raw?.competitor_analysis, {})?.differentiation_points, COMPETITOR_FALLBACK.competitor_analysis.differentiation_points),
      weakness_vs_market:     arr(obj(raw?.competitor_analysis, {})?.weakness_vs_market,     COMPETITOR_FALLBACK.competitor_analysis.weakness_vs_market),
    },

    // ── Phase 5: Insight Summary ──
    insight_summary: {
      strengths:            arr(obj(raw?.insight_summary, {})?.strengths,            INSIGHT_FALLBACK.insight_summary.strengths),
      risks:                arr(obj(raw?.insight_summary, {})?.risks,                INSIGHT_FALLBACK.insight_summary.risks),
      growth_opportunities: arr(obj(raw?.insight_summary, {})?.growth_opportunities, INSIGHT_FALLBACK.insight_summary.growth_opportunities),
      verdict:              str(obj(raw?.insight_summary, {})?.verdict,              INSIGHT_FALLBACK.insight_summary.verdict),
    },
  };
}

async function callOpenAI(prompt, max_tokens = 2000) {
  const key = window.AP3X_API_KEY;
  if (!key) throw new Error('No API key configured. Add your OpenAI key in Configuration below.');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model:       'gpt-4o-mini',
      messages:    [{ role: 'user', content: prompt }],
      temperature: 0.25,
      max_tokens,   // passed per-caller (default 2000 for main analysis, 600 for agents)
    }),
    signal: AbortSignal.timeout(40000),
  });

  if (res.status === 401) throw new Error('Invalid OpenAI API key — check your key in Configuration.');
  if (res.status === 429) throw new Error('OpenAI rate limit hit — wait a moment and retry.');
  if (res.status === 402) throw new Error('OpenAI quota exceeded — check your billing at platform.openai.com.');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `OpenAI API error (${res.status}).`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim() || '';
  if (!text) throw new Error('AI returned an empty response.');
  return text;
}


// ═══════════════════════════════════════════════════
// SECTION 5b — Multi-Agent Intelligence Orchestrator (Phase 3)
// ═══════════════════════════════════════════════════

const AGENTS = [
  {
    key: 'research',
    name: 'Research Agent',
    prompt: (content) => `You are a Research Agent. Analyse the following website content and identify its industry, category, purpose, and broader context.

Return ONLY this JSON object:
{
  "industry": "<primary industry — e.g. SaaS, E-commerce, FinTech, EdTech, HealthTech, Media, Developer Tools>",
  "category": "<specific category within industry>",
  "purpose": "<one sentence: what this product/service does and why it exists>",
  "context_summary": "<two sentences: the broader market context and who would use this>"
}

CONTENT:
Title: ${content.title}
Description: ${content.description}
Headings: ${content.headings.slice(0,10).join(' | ')}
Body: ${content.body.slice(0,2000)}`,
  },
  {
    key: 'business',
    name: 'Business Agent',
    prompt: (content) => `You are a Business Intelligence Agent. Analyse the following website content and extract monetisation strategy and revenue opportunities.

Return ONLY this JSON object:
{
  "monetisation_model": "<primary model — e.g. Subscription, Freemium, Transaction Fee, Advertising, One-time Purchase, Enterprise Licensing>",
  "revenue_streams": ["<stream 1>", "<stream 2>", "<stream 3>"],
  "pricing_signals": "<any pricing cues detected — tiers, free trial, enterprise plans, or 'None detected'>",
  "opportunity_rating": "<Low | Medium | High — one word only>"
}

CONTENT:
Title: ${content.title}
Description: ${content.description}
Headings: ${content.headings.slice(0,10).join(' | ')}
Body: ${content.body.slice(0,2000)}`,
  },
  {
    key: 'technical',
    name: 'Technical Agent',
    prompt: (content) => `You are a Technical Intelligence Agent. Analyse the following website content and infer the technical stack, architecture, and engineering quality signals.

Return ONLY this JSON object:
{
  "inferred_stack": ["<technology or framework 1>", "<technology or framework 2>", "<technology or framework 3>"],
  "architecture_type": "<inferred architecture — e.g. Monolith, Microservices, Serverless, JAMstack, SPA, MPA>",
  "complexity_rating": "<Low | Medium | High — one word only>",
  "scalability_assessment": "<one sentence on inferred scalability based on stack and architecture signals>"
}

CONTENT:
Title: ${content.title}
Description: ${content.description}
Headings: ${content.headings.slice(0,10).join(' | ')}
Body: ${content.body.slice(0,2000)}`,
  },
  {
    key: 'investor',
    name: 'Investor Agent',
    prompt: (content) => `You are an Investor Intelligence Agent. Evaluate the following website content for investment potential, market opportunity, and funding signals.

Return ONLY this JSON object:
{
  "funding_potential": "<Seed | Series A | Series B+ | Bootstrapped | Not Applicable — infer from signals>",
  "market_opportunity": "<one sentence on the addressable market size and opportunity>",
  "investment_signals": ["<signal 1>", "<signal 2>", "<signal 3>"],
  "valuation_indicators": "<one sentence on factors that would influence valuation>"
}

CONTENT:
Title: ${content.title}
Description: ${content.description}
Headings: ${content.headings.slice(0,10).join(' | ')}
Body: ${content.body.slice(0,2000)}`,
  },
  {
    key: 'risk',
    name: 'Risk Agent',
    prompt: (content) => `You are a Risk Intelligence Agent. Identify the key risks, weaknesses, and operational concerns for the following product or service.

Return ONLY this JSON object:
{
  "key_risks": ["<risk 1>", "<risk 2>", "<risk 3>"],
  "operational_concerns": ["<concern 1>", "<concern 2>", "<concern 3>"],
  "market_risks": ["<market risk 1>", "<market risk 2>", "<market risk 3>"],
  "overall_risk_level": "<Low | Medium | High — one word only>"
}

CONTENT:
Title: ${content.title}
Description: ${content.description}
Headings: ${content.headings.slice(0,10).join(' | ')}
Body: ${content.body.slice(0,2000)}`,
  },
  {
    key: 'growth',
    name: 'Growth Agent',
    prompt: (content) => `You are a Growth Intelligence Agent. Identify scaling opportunities, product expansion ideas, and growth trajectory for the following product or service.

Return ONLY this JSON object:
{
  "scaling_opportunities": ["<opportunity 1>", "<opportunity 2>", "<opportunity 3>"],
  "expansion_ideas": ["<idea 1>", "<idea 2>", "<idea 3>"],
  "partnership_potential": "<one sentence on potential partnerships or integrations>",
  "growth_trajectory": "<Declining | Flat | Growing | Hyper-growth — infer from signals>"
}

CONTENT:
Title: ${content.title}
Description: ${content.description}
Headings: ${content.headings.slice(0,10).join(' | ')}
Body: ${content.body.slice(0,2000)}`,
  },
];

function coerceAgentOutput(key, raw) {
  const fb = MULTI_AGENT_FALLBACK.multi_agent_intelligence[key];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...fb };
  const str = (v, d) => (typeof v === 'string' && v.trim()) ? v.trim() : d;
  const arr = (v, d) => Array.isArray(v) && v.length ? v.map(x => String(x).trim()).filter(Boolean) : d;
  switch (key) {
    case 'research':  return { industry: str(raw.industry, fb.industry), category: str(raw.category, fb.category), purpose: str(raw.purpose, fb.purpose), context_summary: str(raw.context_summary, fb.context_summary) };
    case 'business':  return { monetisation_model: str(raw.monetisation_model, fb.monetisation_model), revenue_streams: arr(raw.revenue_streams, fb.revenue_streams), pricing_signals: str(raw.pricing_signals, fb.pricing_signals), opportunity_rating: str(raw.opportunity_rating, fb.opportunity_rating) };
    case 'technical': return { inferred_stack: arr(raw.inferred_stack, fb.inferred_stack), architecture_type: str(raw.architecture_type, fb.architecture_type), complexity_rating: str(raw.complexity_rating, fb.complexity_rating), scalability_assessment: str(raw.scalability_assessment, fb.scalability_assessment) };
    case 'investor':  return { funding_potential: str(raw.funding_potential, fb.funding_potential), market_opportunity: str(raw.market_opportunity, fb.market_opportunity), investment_signals: arr(raw.investment_signals, fb.investment_signals), valuation_indicators: str(raw.valuation_indicators, fb.valuation_indicators) };
    case 'risk':      return { key_risks: arr(raw.key_risks, fb.key_risks), operational_concerns: arr(raw.operational_concerns, fb.operational_concerns), market_risks: arr(raw.market_risks, fb.market_risks), overall_risk_level: str(raw.overall_risk_level, fb.overall_risk_level) };
    case 'growth':    return { scaling_opportunities: arr(raw.scaling_opportunities, fb.scaling_opportunities), expansion_ideas: arr(raw.expansion_ideas, fb.expansion_ideas), partnership_potential: str(raw.partnership_potential, fb.partnership_potential), growth_trajectory: str(raw.growth_trajectory, fb.growth_trajectory) };
    default: return { ...fb };
  }
}

async function runAgents(content) {
  // Run all 6 agents in parallel — reduces total wait from ~4 min to ~40 sec
  const settled = await Promise.allSettled(
    AGENTS.map(async (agent) => {
      const prompt = agent.prompt(content);
      // 900 tokens — enough for structured agent JSON without truncation
      const raw    = await callOpenAI(prompt, 900);
      const cleaned = raw.trim()
        .replace(/^```(?:json)?[\r\n]*/i, '')
        .replace(/```[\r\n]*$/, '')
        .trim();
      const start = cleaned.indexOf('{');
      const end   = cleaned.lastIndexOf('}');
      let parsed = null;
      if (start !== -1 && end !== -1) {
        try { parsed = JSON.parse(cleaned.slice(start, end + 1)); } catch { parsed = null; }
      }
      return { key: agent.key, parsed };
    })
  );

  const results = {};
  AGENTS.forEach((agent, i) => {
    const outcome = settled[i];
    if (outcome.status === 'fulfilled') {
      results[agent.key] = coerceAgentOutput(agent.key, outcome.value.parsed);
    } else {
      console.warn(`[AP3XVER5E] ${agent.name} failed:`, outcome.reason?.message);
      results[agent.key] = { ...MULTI_AGENT_FALLBACK.multi_agent_intelligence[agent.key] };
    }
  });
  return results;
}


// ═══════════════════════════════════════════════════
// SECTION 5c — Intelligence Fusion Engine
// ═══════════════════════════════════════════════════

/**
 * buildFusionContext(mai, analysis)
 *
 * Serialises the multi_agent_intelligence object and key Phase 2
 * fields into a compact text block for the fusion prompt.
 * Only uses existing data — never invents.
 */
function buildFusionContext(mai, analysis) {
  const ag = (key, fields) => {
    const obj = mai[key] || {};
    return fields.map(f => {
      const v = obj[f];
      return `  ${f}: ${Array.isArray(v) ? v.join('; ') : (v || 'Unknown')}`;
    }).join('\n');
  };

  return [
    '=== RESEARCH AGENT ===',
    ag('research', ['industry','category','purpose','context_summary']),
    '=== BUSINESS AGENT ===',
    ag('business', ['monetisation_model','revenue_streams','pricing_signals','opportunity_rating']),
    '=== TECHNICAL AGENT ===',
    ag('technical', ['inferred_stack','architecture_type','complexity_rating','scalability_assessment']),
    '=== INVESTOR AGENT ===',
    ag('investor', ['funding_potential','market_opportunity','investment_signals','valuation_indicators']),
    '=== RISK AGENT ===',
    ag('risk', ['key_risks','operational_concerns','market_risks','overall_risk_level']),
    '=== GROWTH AGENT ===',
    ag('growth', ['scaling_opportunities','expansion_ideas','partnership_potential','growth_trajectory']),
    '=== PHASE 2 SCORES ===',
    `  business_score: ${analysis.business_score ?? 0}`,
    `  technical_score: ${analysis.technical_score ?? 0}`,
    `  investor_score: ${analysis.investor_score ?? 0}`,
    `  scalability_score: ${analysis.scalability_score ?? 0}`,
    `  innovation_score: ${analysis.innovation_score ?? 0}`,
    '=== INSIGHT SUMMARY ===',
    `  strengths: ${(analysis.insight_summary?.strengths || []).join('; ')}`,
    `  risks: ${(analysis.insight_summary?.risks || []).join('; ')}`,
    `  verdict: ${analysis.insight_summary?.verdict || 'Unknown'}`,
  ].join('\n');
}

/**
 * coerceFusion(raw)
 *
 * Coerces the fusion AI response into the canonical shape.
 * Falls back field-by-field — never returns null.
 */
function coerceFusion(raw) {
  const fb  = FUSION_FALLBACK.intelligence_fusion;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...fb };

  const str = (v, d) => (typeof v === 'string' && v.trim()) ? v.trim() : d;
  const arr = (v, d) => Array.isArray(v) && v.length
    ? v.map(x => String(x).trim()).filter(Boolean)
    : d;
  const score = (v) => {
    const n = parseInt(v, 10);
    return (!isNaN(n)) ? Math.min(100, Math.max(0, n)) : fb.overall_intelligence_score;
  };

  return {
    unified_summary:            str(raw.unified_summary,            fb.unified_summary),
    key_insights:               arr(raw.key_insights,               fb.key_insights),
    contradictions:             arr(raw.contradictions,             fb.contradictions),
    strongest_opportunities:    arr(raw.strongest_opportunities,    fb.strongest_opportunities),
    biggest_risks:              arr(raw.biggest_risks,              fb.biggest_risks),
    overall_intelligence_score: score(raw.overall_intelligence_score),
  };
}

/**
 * runFusion(mai, analysis)
 *
 * Calls the AI once with a fusion prompt built exclusively from
 * existing agent outputs and Phase 2 data.
 * Returns a fully-coerced intelligence_fusion object.
 * Never throws — fallback guaranteed.
 */
async function runFusion(mai, analysis) {
  const context = buildFusionContext(mai, analysis);

  const prompt = `You are an Intelligence Fusion Engine. You have received structured outputs from 6 specialised AI agents that analysed the same website. Your task is to synthesise these outputs into a single unified intelligence model.

FUSION RULES:
- You MUST only use the data provided below — do not invent new information
- Resolve overlapping insights into clear, non-redundant statements
- Identify any contradictions between agents
- Prioritise consistency and accuracy over volume
- overall_intelligence_score: a single integer 0-100 reflecting overall signal strength and opportunity quality derived from all scores and agent outputs

AGENT OUTPUTS:
${context}

Return ONLY this JSON object:
{
  "unified_summary": "<2-3 sentence synthesis of what this product is, what opportunity it represents, and its key risk — derived only from agent outputs above>",
  "key_insights": ["<non-redundant insight 1 from any agent>", "<insight 2>", "<insight 3>", "<insight 4>", "<insight 5>"],
  "contradictions": ["<contradiction between agents if any — or 'No significant contradictions detected' if none>"],
  "strongest_opportunities": ["<top opportunity 1 synthesised from business/growth/investor agents>", "<opportunity 2>", "<opportunity 3>"],
  "biggest_risks": ["<top risk 1 synthesised from risk/technical/competitor agents>", "<risk 2>", "<risk 3>"],
  "overall_intelligence_score": <integer 0-100>
}`;

  try {
    const raw = await callOpenAI(prompt, 800);
    let parsed = null;
    try {
      const cleaned = raw.trim().replace(/^```(?:json)?[\r\n]*/i, '').replace(/```[\r\n]*$/, '').trim();
      const s = cleaned.indexOf('{');
      const e = cleaned.lastIndexOf('}');
      if (s !== -1 && e !== -1) parsed = JSON.parse(cleaned.slice(s, e + 1));
    } catch { parsed = null; }
    return coerceFusion(parsed);
  } catch (err) {
    console.warn('[AP3XVER5E] Fusion Engine failed:', err.message);
    return { ...FUSION_FALLBACK.intelligence_fusion };
  }
}


// ═══════════════════════════════════════════════════
// SECTION 5d — Decision Engine (derived from fused intelligence only)
// ═══════════════════════════════════════════════════

/**
 * buildDecisionContext(fusion, analysis)
 *
 * Serialises the intelligence_fusion object and numeric scores
 * into a compact block for the decision prompt.
 * Reads ONLY from fused outputs — never raw content or URL.
 */
function buildDecisionContext(fusion, analysis) {
  const scores = [
    `business_score:    ${analysis.business_score    ?? 0}`,
    `technical_score:   ${analysis.technical_score   ?? 0}`,
    `investor_score:    ${analysis.investor_score    ?? 0}`,
    `scalability_score: ${analysis.scalability_score ?? 0}`,
    `innovation_score:  ${analysis.innovation_score  ?? 0}`,
    `intelligence_score: ${fusion.overall_intelligence_score ?? 0}`,
  ].join('\n');

  const arr2str = (v) => Array.isArray(v) ? v.join('; ') : (v || 'Unknown');

  return [
    '=== UNIFIED SUMMARY ===',
    fusion.unified_summary || 'Unknown',
    '=== SCORES ===',
    scores,
    '=== KEY INSIGHTS ===',
    arr2str(fusion.key_insights),
    '=== CONTRADICTIONS ===',
    arr2str(fusion.contradictions),
    '=== STRONGEST OPPORTUNITIES ===',
    arr2str(fusion.strongest_opportunities),
    '=== BIGGEST RISKS ===',
    arr2str(fusion.biggest_risks),
  ].join('\n');
}

/**
 * coerceDecision(raw)
 *
 * Coerces AI decision response into the canonical shape.
 * Enforces enum values for viability and build_recommendation.
 * Never returns null.
 */
function coerceDecision(raw) {
  const fb = DECISION_FALLBACK.decision_engine;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...fb };

  const str   = (v, d) => (typeof v === 'string' && v.trim()) ? v.trim() : d;
  const score = (v)    => { const n = parseInt(v, 10); return !isNaN(n) ? Math.min(100, Math.max(0, n)) : fb.confidence_score; };
  const VIABILITY = ['high', 'medium', 'low'];
  const BUILD_REC = ['scale', 'improve', 'pivot', 'avoid'];

  const rawViab = str(raw.viability, '').toLowerCase();
  const viability = VIABILITY.includes(rawViab) ? rawViab : fb.viability;

  const rawBuild = str(raw.build_recommendation, '').toLowerCase();
  const build_recommendation = BUILD_REC.includes(rawBuild) ? rawBuild : fb.build_recommendation;

  return {
    viability,
    recommendation:    str(raw.recommendation,    fb.recommendation),
    build_recommendation,
    confidence_score:  score(raw.confidence_score),
    reasoning_summary: str(raw.reasoning_summary, fb.reasoning_summary),
  };
}

/**
 * runDecisionEngine(fusion, analysis)
 *
 * Calls the AI once with a decision prompt built exclusively from
 * the intelligence_fusion object and numeric scores.
 * No raw content, no URL — derived inference only.
 * Returns a fully-coerced decision_engine object. Never throws.
 */
async function runDecisionEngine(fusion, analysis) {
  const context = buildDecisionContext(fusion, analysis);

  const prompt = `You are a Decision Engine. You receive pre-processed intelligence from a multi-agent analysis system. Your task is to produce a structured decision based ONLY on the data provided below.

DECISION RULES:
- Base ALL decisions strictly on the scores and fused intelligence provided
- Do NOT speculate beyond the data given
- viability must be exactly one of: high, medium, low
- build_recommendation must be exactly one of: scale, improve, pivot, avoid
  * scale: strong fundamentals, clear market, low risk — ready to grow
  * improve: good potential but gaps exist — fix before scaling
  * pivot: core concept viable but model/approach needs rethinking
  * avoid: fundamental weaknesses, high risk, low opportunity
- confidence_score: integer 0-100 reflecting certainty of this decision given data quality
- reasoning_summary: 2-3 sentences explaining the decision logic using only the data below

INTELLIGENCE DATA:
${context}

Return ONLY this JSON object:
{
  "viability": "<high | medium | low>",
  "recommendation": "<one clear actionable sentence — what should be done next>",
  "build_recommendation": "<scale | improve | pivot | avoid>",
  "confidence_score": <integer 0-100>,
  "reasoning_summary": "<2-3 sentences: logical chain from data to decision>"
}`;

  try {
    const raw = await callOpenAI(prompt, 500);
    let parsed = null;
    try {
      const cleaned = raw.trim().replace(/^```(?:json)?[\r\n]*/i, '').replace(/```[\r\n]*$/, '').trim();
      const s = cleaned.indexOf('{');
      const e = cleaned.lastIndexOf('}');
      if (s !== -1 && e !== -1) parsed = JSON.parse(cleaned.slice(s, e + 1));
    } catch { parsed = null; }
    return coerceDecision(parsed);
  } catch (err) {
    console.warn('[AP3XVER5E] Decision Engine failed:', err.message);
    return { ...DECISION_FALLBACK.decision_engine };
  }
}

async function analyzeWithAI(content, url) {
  const prompt = buildPrompt(content, url);

  // Attempt 1
  setStatus('Running intelligence analysis...');
  let raw1 = null;
  try { raw1 = await callOpenAI(prompt); }
  catch (e) {
    if (e.message.includes('API key') || e.message.includes('quota') || e.message.includes('rate limit')) throw e;
  }
  const parsed1 = raw1 ? parseAIResponse(raw1) : null;
  if (parsed1) return coerceAnalysis(parsed1);

  // Attempt 2
  setStatus('Analysis incomplete — retrying...');
  await new Promise(r => setTimeout(r, 1400));

  let raw2 = null;
  try { raw2 = await callOpenAI(prompt); }
  catch (e) {
    if (e.message.includes('API key') || e.message.includes('quota') || e.message.includes('rate limit')) throw e;
  }
  const parsed2 = raw2 ? parseAIResponse(raw2) : null;
  if (parsed2) return coerceAnalysis(parsed2);

  console.warn('[AP3XVER5E] Phase 2–5 analysis failed after 2 attempts — serving safe fallback. All fields will be populated from FALLBACK constants.');
  return { ...AI_FALLBACK };
}


// ═══════════════════════════════════════════════════
// SECTION 6 — Project Validation
// ═══════════════════════════════════════════════════
function validateProject(project) {
  if (!project || typeof project !== 'object') throw new Error('Invalid project object.');
  if (!project.id)         throw new Error('Missing project ID.');
  if (!project.url)        throw new Error('Missing project URL.');
  if (!project.created_at) throw new Error('Missing project timestamp.');
  if (!project.analysis || typeof project.analysis !== 'object')
    throw new Error('Missing analysis data.');

  for (const k of P1_KEYS) {
    if (!(k in project.analysis)) throw new Error(`Missing Phase 1 field: ${k}`);
  }
  for (const k of P2_KEYS) {
    if (!(k in project.analysis)) throw new Error(`Missing Phase 2 report: ${k}`);
  }
  for (const k of SCORE_KEYS) {
    if (!(k in project.analysis)) throw new Error(`Missing score field: ${k}`);
  }
  for (const k of COMPETITOR_KEYS) {
    if (!(k in project.analysis)) throw new Error(`Missing competitor field: ${k}`);
  }
  for (const k of INSIGHT_KEYS) {
    if (!(k in project.analysis)) throw new Error(`Missing insight field: ${k}`);
  }
  for (const k of MULTI_AGENT_KEYS) {
    if (!(k in project.analysis)) throw new Error(`Missing multi-agent field: ${k}`);
  }
  for (const k of FUSION_KEYS) {
    if (!(k in project.analysis)) throw new Error(`Missing fusion field: ${k}`);
  }
  for (const k of DECISION_KEYS) {
    if (!(k in project.analysis)) throw new Error(`Missing decision field: ${k}`);
  }
  // Phases 4–8 are computed post-AI-save (require full project list).
  // Validated as soft presence checks — absence is allowed on brand-new records,
  // but the field type must be correct if present.
  const POST_AI_FIELD_GROUPS = [
    { keys: CROSS_KEYS,        label: 'cross-project link' },
    { keys: GRAPH_KEYS,        label: 'knowledge graph'    },
    { keys: SEMANTIC_KEYS,     label: 'semantic memory'    },
    { keys: REASONING_KEYS,    label: 'cross-project reasoning' },
    { keys: PORTFOLIO_KEYS,    label: 'portfolio intelligence report' },
    { keys: VISUAL_MAP_KEYS,   label: 'portfolio visual map' },
    { keys: TRACE_KEYS,        label: 'reasoning trace' },
    { keys: CONFIDENCE_KEYS,   label: 'confidence model' },
    { keys: COMPARISON_KEYS,   label: 'comparison engine' },
    { keys: BUILDER_KEYS,      label: 'builder profile' },
    { keys: EVOLUTION_KEYS,    label: 'evolution tracker' },
    { keys: WHATIF_KEYS,       label: 'what-if engine' },
  ];
  POST_AI_FIELD_GROUPS.forEach(({ keys, label }) => {
    keys.forEach(k => {
      if (k in project.analysis) {
        if (project.analysis[k] === null || typeof project.analysis[k] !== 'object')
          throw new Error(`${label} field '${k}' present but not a valid object.`);
      }
      // Absence is permitted — field is built post-save
    });
  });
  // Validate digital twin envelope
  if (!project.digital_twin || typeof project.digital_twin !== 'object')
    throw new Error('Project missing digital_twin.');
  validateDigitalTwin(project.digital_twin);
  return true;
}



/**
 * dbMigrateTwin(project)
 *
 * Back-fills the digital_twin envelope on legacy records (version < 5)
 * that were stored before this model was introduced.
 * Updates the record in-place in IndexedDB and returns the patched project.
 */
async function dbMigrateTwin(project) {
  // Skip if twin is fully migrated (v8.0 — has portfolio_visual_map)
  if (project.digital_twin?.portfolio_visual_map) return project;
  // Back-fill knowledge_graph + cross_project_links with fallback on legacy records
  // (accurate data requires full project list — recomputed on next analysis run)
  if (!project.analysis) return project;             // no analysis — can't build twin

  const patched = {
    ...project,
    digital_twin: buildDigitalTwin(project.analysis),
    version: (project.version || 1),                // keep original version for audit
  };

  try { await dbPut(patched); } catch (e) {
    console.warn('[AP3XVER5E] Could not persist migrated twin:', e.message);
  }
  return patched;
}


// ═══════════════════════════════════════════════════
// SECTION 5e — Cross-Project Intelligence Memory
// ═══════════════════════════════════════════════════

/**
 * extractProjectSignature(project)
 *
 * Extracts a normalised, comparable fingerprint from a stored project
 * using only data already in IndexedDB — no external calls.
 */
function extractProjectSignature(project) {
  const a  = project.analysis      || {};
  const dt = project.digital_twin  || {};
  const mai = dt.multi_agent_intelligence || a.multi_agent_intelligence || {};
  const fus = dt.intelligence_fusion     || a.intelligence_fusion      || {};
  const dec = dt.decision_engine         || a.decision_engine          || {};

  return {
    id:              project.id,
    url:             project.url || '',
    industry:        (mai.research?.industry        || 'Unknown').toLowerCase().trim(),
    category:        (mai.research?.category        || 'Unknown').toLowerCase().trim(),
    monetisation:    (mai.business?.monetisation_model || 'Unknown').toLowerCase().trim(),
    build_rec:       (dec.build_recommendation      || 'unknown').toLowerCase().trim(),
    viability:       (dec.viability                 || 'unknown').toLowerCase().trim(),
    risk_level:      (mai.risk?.overall_risk_level  || 'unknown').toLowerCase().trim(),
    opportunity_rating:(mai.business?.opportunity_rating || 'unknown').toLowerCase().trim(),
    growth_traj:     (mai.growth?.growth_trajectory || 'unknown').toLowerCase().trim(),
    scores: {
      business:    parseInt(a.business_score,    10) || 0,
      technical:   parseInt(a.technical_score,   10) || 0,
      investor:    parseInt(a.investor_score,    10) || 0,
      scalability: parseInt(a.scalability_score, 10) || 0,
      innovation:  parseInt(a.innovation_score,  10) || 0,
    },
    strengths:  (a.insight_summary?.strengths            || []).map(s => s.toLowerCase()),
    risks:      (a.insight_summary?.risks                || []).map(s => s.toLowerCase()),
    key_risks:  (mai.risk?.key_risks                     || []).map(s => s.toLowerCase()),
    insights:   (fus.key_insights                        || []).map(s => s.toLowerCase()),
  };
}

/**
 * computeSimilarity(sigA, sigB)
 *
 * Returns a similarity score 0.0–1.0 between two project signatures.
 * Pure deterministic function — no randomness, no external data.
 */
function computeSimilarity(sigA, sigB) {
  let score = 0;
  let weight = 0;

  // Industry match (high weight)
  const industryMatch = sigA.industry !== 'unknown' && sigA.industry === sigB.industry;
  score  += industryMatch ? 3 : 0;
  weight += 3;

  // Category match (high weight)
  const categoryMatch = sigA.category !== 'unknown' && sigA.category === sigB.category;
  score  += categoryMatch ? 2 : 0;
  weight += 2;

  // Monetisation model match
  const monoMatch = sigA.monetisation !== 'unknown' && sigA.monetisation === sigB.monetisation;
  score  += monoMatch ? 1.5 : 0;
  weight += 1.5;

  // Decision alignment (build_rec + viability)
  score  += sigA.build_rec  === sigB.build_rec  ? 1 : 0;
  score  += sigA.viability  === sigB.viability  ? 0.5 : 0;
  weight += 1.5;

  // Risk level match
  score  += sigA.risk_level === sigB.risk_level ? 1 : 0;
  weight += 1;

  // Score proximity (within 15 points across all 5)
  const scoreKeys = ['business','technical','investor','scalability','innovation'];
  let scoreMatches = 0;
  scoreKeys.forEach(k => {
    if (Math.abs((sigA.scores[k] || 0) - (sigB.scores[k] || 0)) <= 15) scoreMatches++;
  });
  score  += (scoreMatches / scoreKeys.length) * 1.5;
  weight += 1.5;

  // Shared risk keywords (token overlap)
  const riskA = new Set(sigA.key_risks.flatMap(r => r.split(/\s+/)).filter(w => w.length > 4));
  const riskB = new Set(sigB.key_risks.flatMap(r => r.split(/\s+/)).filter(w => w.length > 4));
  const riskOverlap = [...riskA].filter(w => riskB.has(w)).length;
  score  += Math.min(riskOverlap / 3, 1) * 1;
  weight += 1;

  // Shared insight keywords
  const inA = new Set(sigA.insights.flatMap(r => r.split(/\s+/)).filter(w => w.length > 4));
  const inB = new Set(sigB.insights.flatMap(r => r.split(/\s+/)).filter(w => w.length > 4));
  const inOverlap = [...inA].filter(w => inB.has(w)).length;
  score  += Math.min(inOverlap / 4, 1) * 0.5;
  weight += 0.5;

  return weight > 0 ? Math.min(score / weight, 1.0) : 0;
}

/**
 * buildCrossProjectLinks(currentProject, allProjects)
 *
 * Reads only stored IndexedDB data.
 * Returns a cross_project_links object for the current project.
 * Deterministic — same inputs always produce same outputs.
 */
function buildCrossProjectLinks(currentProject, allProjects) {
  const fb = CROSS_FALLBACK.cross_project_links;

  // Filter to other projects that have analysis data
  const others = allProjects.filter(p =>
    p.id !== currentProject.id && p.analysis
  );

  if (others.length === 0) {
    return { ...fb };
  }

  const currentSig = extractProjectSignature(currentProject);
  const otherSigs  = others.map(p => ({ sig: extractProjectSignature(p), project: p }));

  // ── similar_projects ──
  // Projects with similarity >= 0.45, sorted descending, max 5
  const SIMILARITY_THRESHOLD = 0.45;
  const scored = otherSigs
    .map(({ sig, project }) => ({
      similarity: computeSimilarity(currentSig, sig),
      url:        project.url,
      name:       project.analysis?.project_name || project.url,
      industry:   sig.industry,
      build_rec:  sig.build_rec,
    }))
    .filter(r => r.similarity >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);

  const similar_projects = scored.map(r => {
    const pct = Math.round(r.similarity * 100);
    const label = r.name !== r.url ? r.name : new URL(r.url).hostname;
    return `${label} (${pct}% match — ${r.build_rec || 'unknown'})`;
  });

  // ── shared_patterns ──
  // Detect recurring build recommendations, viability ratings,
  // risk levels, and industry groupings across ALL stored projects
  const patterns = [];
  const allSigs  = [currentSig, ...otherSigs.map(o => o.sig)];
  const total    = allSigs.length;

  const count = (arr, val) => arr.filter(s => s === val).length;

  // Build rec patterns (≥40% of projects share same recommendation)
  const buildRecs = allSigs.map(s => s.build_rec).filter(v => v && v !== 'unknown');
  const buildRecCounts = {};
  buildRecs.forEach(v => { buildRecCounts[v] = (buildRecCounts[v] || 0) + 1; });
  Object.entries(buildRecCounts).forEach(([rec, cnt]) => {
    if (cnt / total >= 0.4 && cnt >= 2)
      patterns.push(`${Math.round(cnt/total*100)}% of analysed projects recommend "${rec}"`);
  });

  // Risk level patterns
  const riskLevels = allSigs.map(s => s.risk_level).filter(v => v && v !== 'unknown');
  const riskCounts = {};
  riskLevels.forEach(v => { riskCounts[v] = (riskCounts[v] || 0) + 1; });
  Object.entries(riskCounts).forEach(([lvl, cnt]) => {
    if (cnt / total >= 0.5 && cnt >= 2)
      patterns.push(`Recurring ${lvl}-risk profile across ${cnt} project${cnt > 1 ? 's' : ''}`);
  });

  // Monetisation patterns
  const monos = allSigs.map(s => s.monetisation).filter(v => v && v !== 'unknown');
  const monoCounts = {};
  monos.forEach(v => { monoCounts[v] = (monoCounts[v] || 0) + 1; });
  Object.entries(monoCounts).forEach(([mono, cnt]) => {
    if (cnt >= 2)
      patterns.push(`${mono} monetisation model seen in ${cnt} project${cnt > 1 ? 's' : ''}`);
  });

  // Shared weakness keywords across project risks
  const allRiskWords = otherSigs.flatMap(o => o.sig.key_risks)
    .flatMap(r => r.split(/\s+/))
    .filter(w => w.length > 5);
  const wordFreq = {};
  allRiskWords.forEach(w => { wordFreq[w] = (wordFreq[w] || 0) + 1; });
  const topRiskWords = Object.entries(wordFreq)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w);
  if (topRiskWords.length > 0)
    patterns.push(`Shared weakness signals: ${topRiskWords.join(', ')}`);

  const shared_patterns = patterns.length > 0
    ? patterns.slice(0, 5)
    : ['No recurring patterns detected yet — analyse more projects to surface trends.'];

  // ── market_clusters ──
  // Group all projects by industry, emit clusters with ≥2 members
  const industryGroups = {};
  allSigs.forEach(s => {
    const ind = s.industry !== 'unknown' ? s.industry : 'Unclassified';
    if (!industryGroups[ind]) industryGroups[ind] = [];
    industryGroups[ind].push(s.category);
  });

  const market_clusters = Object.entries(industryGroups)
    .filter(([, cats]) => cats.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5)
    .map(([ind, cats]) => {
      const uniqueCats = [...new Set(cats.filter(c => c !== 'unknown'))];
      return uniqueCats.length > 0
        ? `${ind}: ${uniqueCats.slice(0,3).join(', ')} (${cats.length} project${cats.length > 1 ? 's' : ''})`
        : `${ind} (${cats.length} project${cats.length > 1 ? 's' : ''})`;
    });

  return {
    similar_projects: similar_projects.length > 0 ? similar_projects : [],
    shared_patterns,
    market_clusters: market_clusters.length > 0 ? market_clusters : ['Unclustered — single industry detected so far.'],
  };
}


// ═══════════════════════════════════════════════════
// SECTION 5f — Knowledge Graph Engine (Phase 4)
// ═══════════════════════════════════════════════════

/**
 * buildGraphNode(project)
 *
 * Constructs a graph node from a stored project.
 * Reads only from project.analysis and project.digital_twin.
 */
function buildGraphNode(project) {
  const a   = project.analysis     || {};
  const dt  = project.digital_twin || {};
  const mai = dt.multi_agent_intelligence || a.multi_agent_intelligence || {};
  const fus = dt.intelligence_fusion     || a.intelligence_fusion      || {};
  const dec = dt.decision_engine         || a.decision_engine          || {};

  const name = a.project_name
    || (project.url ? (() => { try { return new URL(project.url).hostname; } catch { return project.url; } })() : 'Unknown');

  return {
    id:               project.id,
    url:              project.url              || '',
    name,
    category:         (mai.research?.category  || a.industry || 'Unknown'),
    industry:         (mai.research?.industry  || 'Unknown'),
    analysis_summary: (fus.unified_summary     || a.insight_summary?.verdict || 'No summary available.'),
    viability:        (dec.viability           || 'unknown'),
    build_rec:        (dec.build_recommendation || 'unknown'),
    risk_level:       (mai.risk?.overall_risk_level || 'unknown'),
    growth_traj:      (mai.growth?.growth_trajectory || 'unknown'),
  };
}

/**
 * EDGE_TYPES — canonical relation type identifiers
 */
const EDGE_TYPES = Object.freeze({
  SIMILAR_TO:           'SIMILAR_TO',
  SAME_INDUSTRY:        'SAME_INDUSTRY',
  SHARED_FEATURES:      'SHARED_FEATURES',
  SHARED_RISKS:         'SHARED_RISKS',
  SHARED_OPPORTUNITIES: 'SHARED_OPPORTUNITIES',
});

/**
 * edgeId(fromId, toId, type)
 *
 * Canonical deduplication key — edges are undirected per type,
 * so (A→B) and (B→A) of the same type are the same edge.
 */
function edgeId(fromId, toId, type) {
  const [a, b] = fromId < toId ? [fromId, toId] : [toId, fromId];
  return `${a}::${b}::${type}`;
}

/**
 * tokenise(str)
 *
 * Splits a string into lowercase meaningful tokens (>4 chars).
 * Used for keyword overlap scoring.
 */
function tokenise(str) {
  if (!str || typeof str !== 'string') return new Set();
  return new Set(
    str.toLowerCase()
       .replace(/[^a-z0-9\s]/g, ' ')
       .split(/\s+/)
       .filter(w => w.length > 4)
  );
}

/**
 * tokeniseArr(arr)
 *
 * Tokenises an array of strings into a single merged Set.
 */
function tokeniseArr(arr) {
  if (!Array.isArray(arr)) return new Set();
  const merged = new Set();
  arr.forEach(s => tokenise(s).forEach(t => merged.add(t)));
  return merged;
}

/**
 * jaccardStrength(setA, setB)
 *
 * Jaccard similarity → 0–100 integer strength.
 * Returns 0 when both sets are empty.
 */
function jaccardStrength(setA, setB) {
  if (!setA.size && !setB.size) return 0;
  const intersection = [...setA].filter(t => setB.has(t)).length;
  const union        = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : Math.round((intersection / union) * 100);
}

/**
 * inferEdges(sigA, sigB, nodeA, nodeB)
 *
 * Returns 0–5 edge objects between two projects.
 * Each edge type is checked independently.
 * Only emits an edge when evidence is above threshold.
 * Fully deterministic — no randomness, no external data.
 */

/**
 * computeSimilarityBreakdown(sigA, sigB)
 *
 * Returns { features, business, technical, market } — each 0–100.
 * Each dimension uses Jaccard over the relevant _raw token sets,
 * supplemented by structured field matching from the signature.
 * Deterministic. No external data. No AI calls.
 */
function computeSimilarityBreakdown(sigA, sigB) {
  const rA = sigA._raw || {};
  const rB = sigB._raw || {};

  // ── features (0-100) ──
  // revenue streams + scaling opportunities + expansion ideas + strongest opps + monetisation model
  const featA = tokeniseArr([
    ...(rA.revenue_streams        || []),
    ...(rA.scaling_opportunities  || []),
    ...(rA.expansion_ideas        || []),
    ...(rA.strongest_opportunities|| []),
    sigA.monetisation || '',
  ]);
  const featB = tokeniseArr([
    ...(rB.revenue_streams        || []),
    ...(rB.scaling_opportunities  || []),
    ...(rB.expansion_ideas        || []),
    ...(rB.strongest_opportunities|| []),
    sigB.monetisation || '',
  ]);
  const features = jaccardStrength(featA, featB);

  // ── business (0-100) ──
  // monetisation match (high weight) + pricing signals + partnership potential
  // + opportunity_rating match + build_rec match
  let business = 0;
  {
    const monoMatch = sigA.monetisation && sigA.monetisation !== 'unknown'
                   && sigA.monetisation === sigB.monetisation;
    const recMatch  = sigA.build_rec    && sigA.build_rec !== 'unknown'
                   && sigA.build_rec    === sigB.build_rec;
    const viaMatch  = sigA.viability    && sigA.viability !== 'unknown'
                   && sigA.viability    === sigB.viability;
    const bizA = tokeniseArr([
      ...(rA.pricing_signals      || []),
      ...(rA.partnership_potential|| []),
      sigA.opportunity_rating || '',
    ]);
    const bizB = tokeniseArr([
      ...(rB.pricing_signals      || []),
      ...(rB.partnership_potential|| []),
      sigB.opportunity_rating || '',
    ]);
    const tokScore = jaccardStrength(bizA, bizB);
    // Weighted: mono=35, rec+viability=25, tok=40
    business = Math.round(
      (monoMatch ? 35 : 0) +
      ((recMatch ? 15 : 0) + (viaMatch ? 10 : 0)) +
      tokScore * 0.40
    );
    business = Math.min(100, business);
  }

  // ── technical (0-100) ──
  // inferred stack + architecture_type + complexity_rating
  const techA = tokeniseArr([
    ...(rA.inferred_stack     || []),
    ...(rA.architecture_type  || []),
    ...(rA.complexity_rating  || []),
  ]);
  const techB = tokeniseArr([
    ...(rB.inferred_stack     || []),
    ...(rB.architecture_type  || []),
    ...(rB.complexity_rating  || []),
  ]);
  const technical = jaccardStrength(techA, techB);

  // ── market (0-100) ──
  // industry+category match (high weight) + valuation_indicators + investment_signals + market_opportunity
  let market = 0;
  {
    const indMatch  = sigA.industry && sigA.industry !== 'unknown' && sigA.industry === sigB.industry;
    const catMatch  = sigA.category && sigA.category !== 'unknown' && sigA.category === sigB.category;
    const mktA = tokeniseArr([
      ...(rA.valuation_indicators || []),
      ...(rA.investment_signals   || []),
      ...(rA.market_opportunity   || []),
    ]);
    const mktB = tokeniseArr([
      ...(rB.valuation_indicators || []),
      ...(rB.investment_signals   || []),
      ...(rB.market_opportunity   || []),
    ]);
    const tokScore = jaccardStrength(mktA, mktB);
    // Weighted: category=40, industry=20, tok=40
    market = Math.round(
      (catMatch ? 40 : 0) +
      (indMatch ? 20 : 0) +
      tokScore * 0.40
    );
    market = Math.min(100, market);
  }

  return { features, business, technical, market };
}

function inferEdges(sigA, sigB, nodeA, nodeB) {
  const edges = [];
  const seen  = new Set();

  // Pre-compute the 4-dimensional breakdown once — shared by all edge types
  const breakdown = computeSimilarityBreakdown(sigA, sigB);

  // Weighted composite edge_strength from the 4 dimensions
  // weights: features=30, business=30, technical=20, market=20
  const compositeStrength = Math.round(
    breakdown.features  * 0.30 +
    breakdown.business  * 0.30 +
    breakdown.technical * 0.20 +
    breakdown.market    * 0.20
  );

  /**
   * emit(type, rawStrength, reason)
   *
   * rawStrength  — the type-specific signal strength (0-100)
   * edge_strength — the weighted composite across all 4 dimensions
   * Both are stored; strength = composite (as required by spec).
   */
  const emit = (type, rawStrength, reason) => {
    if (rawStrength <= 0) return;
    const eid = edgeId(sigA.id, sigB.id, type);
    if (seen.has(eid)) return;
    seen.add(eid);
    edges.push({
      from:          sigA.id,
      to:            sigB.id,
      type,
      strength:      Math.min(100, Math.max(1, compositeStrength)),
      reason,
      analysis: {
        similarity_breakdown: {
          features:  breakdown.features,
          business:  breakdown.business,
          technical: breakdown.technical,
          market:    breakdown.market,
        },
      },
    });
  };

  // ── 1. SIMILAR_TO ──
  // Gate: composite ≥ 35. Strength = composite (already weighted across all dims).
  {
    const sim = computeSimilarity(sigA, sigB);
    if (sim >= 0.35 || compositeStrength >= 35) {
      const pct = Math.max(Math.round(sim * 100), compositeStrength);
      emit(
        EDGE_TYPES.SIMILAR_TO,
        pct,
        `${compositeStrength}% weighted similarity (features:${breakdown.features} business:${breakdown.business} technical:${breakdown.technical} market:${breakdown.market}).`
      );
    }
  }

  // ── 2. SAME_INDUSTRY ──
  // Gate: industry or category match. Strength = composite, floor 60/85 on match.
  {
    const indMatch = sigA.industry !== 'unknown' && sigA.industry === sigB.industry;
    const catMatch = sigA.category !== 'unknown' && sigA.category === sigB.category;
    if (indMatch || catMatch) {
      const baseStrength = catMatch ? 85 : 60;
      const finalStrength = Math.max(baseStrength, compositeStrength);
      const reason = catMatch
        ? `Both operate in the "${sigA.category}" category (${sigA.industry}). Composite: ${compositeStrength}.`
        : `Both in the "${sigA.industry}" industry. Composite: ${compositeStrength}.`;
      emit(EDGE_TYPES.SAME_INDUSTRY, finalStrength, reason);
    }
  }

  // ── 3. SHARED_FEATURES ──
  // Gate: feature dimension ≥ 20 OR composite ≥ 25.
  // Repeated business models, feature sets, tech stacks detected here.
  {
    const rA = sigA._raw || {};
    const rB = sigB._raw || {};
    const tokA = tokeniseArr([
      ...(rA.revenue_streams        || []),
      ...(rA.inferred_stack         || []),
      ...(rA.scaling_opportunities  || []),
      ...(rA.expansion_ideas        || []),
      sigA.monetisation || '',
    ]);
    const tokB = tokeniseArr([
      ...(rB.revenue_streams        || []),
      ...(rB.inferred_stack         || []),
      ...(rB.scaling_opportunities  || []),
      ...(rB.expansion_ideas        || []),
      sigB.monetisation || '',
    ]);
    const rawStr = jaccardStrength(tokA, tokB);
    if (rawStr >= 20 || compositeStrength >= 25) {
      const shared = [...tokA].filter(t => tokB.has(t)).slice(0, 4).join(', ');
      emit(
        EDGE_TYPES.SHARED_FEATURES,
        rawStr,
        `Overlapping feature/model signals: ${shared || 'similar product characteristics'}. Feature score: ${breakdown.features}, technical: ${breakdown.technical}.`
      );
    }
  }

  // ── 4. SHARED_RISKS ──
  // Gate: risk keyword overlap ≥ 15 OR composite ≥ 25.
  // Repeated risk patterns, operational weaknesses, market risks.
  {
    const rA = sigA._raw || {};
    const rB = sigB._raw || {};
    const tokA = tokeniseArr([
      ...sigA.key_risks,
      ...sigA.risks,
      ...(rA.operational_concerns || []),
      ...(rA.market_risks         || []),
    ]);
    const tokB = tokeniseArr([
      ...sigB.key_risks,
      ...sigB.risks,
      ...(rB.operational_concerns || []),
      ...(rB.market_risks         || []),
    ]);
    const rawStr = jaccardStrength(tokA, tokB);
    if (rawStr >= 15 || compositeStrength >= 25) {
      const shared = [...tokA].filter(t => tokB.has(t)).slice(0, 3).join(', ');
      emit(
        EDGE_TYPES.SHARED_RISKS,
        rawStr,
        `Shared risk patterns: ${shared || 'overlapping risk profiles'}. Business: ${breakdown.business}, market: ${breakdown.market}.`
      );
    }
  }

  // ── 5. SHARED_OPPORTUNITIES ──
  // Gate: opportunity keyword overlap ≥ 15 OR composite ≥ 25.
  // Repeated investor profiles, growth trajectories, partnership patterns.
  {
    const rA = sigA._raw || {};
    const rB = sigB._raw || {};
    const tokA = tokeniseArr([
      ...(rA.scaling_opportunities  || []),
      ...(rA.expansion_ideas        || []),
      ...(rA.strongest_opportunities|| []),
      ...(rA.valuation_indicators   || []),
      ...(rA.investment_signals     || []),
      ...sigA.strengths,
    ]);
    const tokB = tokeniseArr([
      ...(rB.scaling_opportunities  || []),
      ...(rB.expansion_ideas        || []),
      ...(rB.strongest_opportunities|| []),
      ...(rB.valuation_indicators   || []),
      ...(rB.investment_signals     || []),
      ...sigB.strengths,
    ]);
    const rawStr = jaccardStrength(tokA, tokB);
    if (rawStr >= 15 || compositeStrength >= 25) {
      const shared = [...tokA].filter(t => tokB.has(t)).slice(0, 3).join(', ');
      emit(
        EDGE_TYPES.SHARED_OPPORTUNITIES,
        rawStr,
        `Shared opportunity/investor signals: ${shared || 'overlapping growth potential'}. Business: ${breakdown.business}, market: ${breakdown.market}.`
      );
    }
  }

  return edges;
}

/**
 * enrichSignature(project)
 *
 * Extends extractProjectSignature with _raw fields needed
 * for SHARED_FEATURES and SHARED_OPPORTUNITIES edge inference.
 * Reads only from stored project data.
 */
function enrichSignature(project) {
  const sig = extractProjectSignature(project);
  const dt  = project.digital_twin || {};
  const a   = project.analysis     || {};
  const mai = dt.multi_agent_intelligence || a.multi_agent_intelligence || {};
  const fus = dt.intelligence_fusion     || a.intelligence_fusion      || {};

  sig._raw = {
    // ── Feature dimension ──
    revenue_streams:         mai.business?.revenue_streams         || [],
    inferred_stack:          mai.technical?.inferred_stack         || [],
    scaling_opportunities:   mai.growth?.scaling_opportunities     || [],
    expansion_ideas:         mai.growth?.expansion_ideas           || [],
    strongest_opportunities: fus.strongest_opportunities           || [],
    // ── Business dimension ──
    pricing_signals:         mai.business?.pricing_signals         || [],
    partnership_potential:   mai.growth?.partnership_potential     || [],
    // ── Technical dimension ──
    architecture_type:       mai.technical?.architecture_type      ? [mai.technical.architecture_type] : [],
    complexity_rating:       mai.technical?.complexity_rating      ? [mai.technical.complexity_rating] : [],
    // ── Market/Investor dimension ──
    valuation_indicators:    mai.investor?.valuation_indicators    || [],
    investment_signals:      mai.investor?.investment_signals      || [],
    market_opportunity:      mai.investor?.market_opportunity      ? [mai.investor.market_opportunity] : [],
    // ── Risk dimension ──
    operational_concerns:    mai.risk?.operational_concerns        || [],
    market_risks:            mai.risk?.market_risks                || [],
  };

  return sig;
}

/**
 * buildKnowledgeGraph(allProjects)
 *
 * Constructs the full knowledge graph from all stored projects.
 * - nodes: one per project with analysis data
 * - edges: all pairwise edge inferences, deduplicated
 * No AI calls, no external data, no randomness.
 */

// ═══════════════════════════════════════════════════
// SECTION 5g — Intelligence Cluster Engine (Phase 4.2)
// ═══════════════════════════════════════════════════

/**
 * CLUSTER_DEFINITIONS
 *
 * Each cluster definition contains:
 *   name       — canonical cluster label
 *   signals    — keyword tokens that indicate membership
 *   fields     — which _raw / sig fields to search for those signals
 *
 * Signals are lowercased strings. Matching is token-overlap based
 * (tokenise / tokeniseArr already defined above).
 * No external data. No AI calls. Fully deterministic.
 */
const CLUSTER_DEFINITIONS = Object.freeze([
  {
    name: 'SaaS',
    signals: [
      'saas','subscription','recurring','monthly','annual','seat','tier','plan',
      'software','platform','dashboard','workflow','automation','cloud','api',
      'b2b','enterprise','self-serve','freemium','multi-tenant',
    ],
  },
  {
    name: 'AI Tools',
    signals: [
      'artificial intelligence','machine learning','neural','nlp','language model',
      'generative','gpt','llm','embedding','prediction','classifier','inference',
      'ai','model','training','dataset','prompt','chatbot','recommendation',
      'computer vision','recognition','detection','openai','anthropic',
    ],
  },
  {
    name: 'Education Platforms',
    signals: [
      'education','learning','course','curriculum','student','teacher','school',
      'university','elearning','e-learning','tutorial','lesson','quiz','certificate',
      'training','skill','upskill','bootcamp','edtech','academic','knowledge',
      'classroom','lms','mooc','assessment',
    ],
  },
  {
    name: 'Business Systems',
    signals: [
      'crm','erp','accounting','invoicing','payroll','hr','human resources',
      'operations','inventory','supply chain','procurement','analytics','reporting',
      'business intelligence','kpi','finance','billing','sales','pipeline',
      'lead','customer','management','enterprise resource',
    ],
  },
  {
    name: 'Automation Systems',
    signals: [
      'automation','workflow','trigger','pipeline','integration','webhook',
      'scheduler','cron','bot','rpa','robotic','orchestration','no-code',
      'low-code','zapier','make','n8n','automate','task','process',
      'event-driven','queue','batch',
    ],
  },
]);

/**
 * scoreProjectForCluster(sig, clusterDef)
 *
 * Scores a single project against a cluster definition: 0–100.
 *
 * Strategy: tokenise all available text signals from the signature
 * and _raw payload, then compute overlap with the cluster's signals.
 * A score ≥ 30 qualifies the project for the cluster.
 *
 * Returns integer 0–100.
 */
function scoreProjectForCluster(sig, clusterDef) {
  const r = sig._raw || {};

  // Aggregate all text from the signature into one token pool
  const projectTokens = tokeniseArr([
    sig.industry         || '',
    sig.category         || '',
    sig.monetisation     || '',
    sig.growth_traj      || '',
    sig.risk_level       || '',
    sig.opportunity_rating || '',
    ...(r.revenue_streams         || []),
    ...(r.inferred_stack          || []),
    ...(r.scaling_opportunities   || []),
    ...(r.expansion_ideas         || []),
    ...(r.strongest_opportunities || []),
    ...(r.architecture_type       || []),
    ...(r.pricing_signals         || []),
    ...(r.partnership_potential   || []),
    ...(r.valuation_indicators    || []),
    ...(r.investment_signals      || []),
    ...(r.market_opportunity      || []),
    ...(r.operational_concerns    || []),
    ...(r.market_risks            || []),
    ...sig.strengths,
    ...sig.key_risks,
    ...sig.insights,
  ]);

  // Also include the raw node name/url for high-signal words
  const nodeSrc = `${sig.industry} ${sig.category}`.toLowerCase();
  tokenise(nodeSrc).forEach(t => projectTokens.add(t));

  // Cluster signal pool
  const clusterTokens = tokeniseArr(clusterDef.signals);

  // Add each signal phrase itself (unbroken, for multi-word signals)
  clusterDef.signals.forEach(s => {
    s.split(/\s+/).filter(w => w.length > 3).forEach(w => clusterTokens.add(w));
  });

  // Compute directional overlap: what % of cluster signals appear in project?
  // (directional: we care whether the project covers the cluster, not vice-versa)
  const matchCount = [...clusterTokens].filter(t => projectTokens.has(t)).length;
  const clusterSize = clusterTokens.size;

  if (clusterSize === 0) return 0;

  // Raw overlap ratio → scale to 0-100, boost if many unique matches
  const ratio   = matchCount / clusterSize;
  const boosted = Math.min(1.0, ratio * 3.5);  // scale: ≥~29% overlap → 100
  return Math.round(boosted * 100);
}

/**
 * buildIntelligenceClusters(nodes, sigs)
 *
 * Groups nodes into intelligence clusters based on CLUSTER_DEFINITIONS.
 *
 * For each cluster:
 *   1. Score every project against it.
 *   2. Include projects scoring ≥ CLUSTER_THRESHOLD.
 *   3. Derive shared_characteristics from token intersection across members.
 *   4. cluster_score = mean score of all members (rounded).
 *
 * Returns intelligence_clusters array. Empty array if no clusters qualify.
 * Deterministic. No AI calls. No external data.
 */
function buildIntelligenceClusters(nodes, sigs) {
  const CLUSTER_THRESHOLD = 30;  // minimum score to join a cluster

  return CLUSTER_DEFINITIONS.map(def => {
    // Score every project for this cluster
    const scored = sigs.map((sig, i) => ({
      score:   scoreProjectForCluster(sig, def),
      nodeId:  sig.id,
      nodeName: nodes[i]?.name || sig.id,
      sig,
    })).filter(s => s.score >= CLUSTER_THRESHOLD);

    if (scored.length === 0) return null;  // cluster has no members — exclude

    // project IDs / names for the output
    const projects = scored.map(s => s.nodeName);

    // cluster_score = mean of member scores
    const cluster_score = Math.round(
      scored.reduce((sum, s) => sum + s.score, 0) / scored.length
    );

    // shared_characteristics: token intersection across all member signatures
    // Start with full token set of first member, intersect with each subsequent
    let commonTokens = null;
    scored.forEach(({ sig }) => {
      const r = sig._raw || {};
      const memberTokens = tokeniseArr([
        sig.industry         || '',
        sig.category         || '',
        sig.monetisation     || '',
        ...(r.revenue_streams         || []),
        ...(r.inferred_stack          || []),
        ...(r.scaling_opportunities   || []),
        ...(r.expansion_ideas         || []),
        ...(r.strongest_opportunities || []),
        ...(r.pricing_signals         || []),
        ...sig.strengths,
        ...sig.insights,
      ]);

      if (commonTokens === null) {
        commonTokens = memberTokens;
      } else {
        // Intersect: keep only tokens present in both
        commonTokens = new Set([...commonTokens].filter(t => memberTokens.has(t)));
      }
    });

    // Filter intersection down to cluster-relevant tokens only
    const clusterTokens = tokeniseArr(def.signals);
    const relevant = commonTokens
      ? [...commonTokens].filter(t => clusterTokens.has(t) && t.length > 4)
      : [];

    // Produce up to 5 human-readable characteristic strings
    // Group by category: industry, monetisation, stack, opportunity, risk
    const chars = new Set();

    // Shared industry / category
    const sharedIndustry = [...new Set(scored.map(s => s.sig.industry).filter(v => v && v !== 'unknown'))];
    if (sharedIndustry.length > 0)
      chars.add(`Industry: ${sharedIndustry.slice(0,2).join(' / ')}`);

    const sharedCat = [...new Set(scored.map(s => s.sig.category).filter(v => v && v !== 'unknown'))];
    if (sharedCat.length > 0)
      chars.add(`Category: ${sharedCat.slice(0,2).join(' / ')}`);

    // Shared monetisation
    const monoFreq = {};
    scored.forEach(s => { const m = s.sig.monetisation; if (m && m !== 'unknown') monoFreq[m] = (monoFreq[m]||0)+1; });
    const topMono = Object.entries(monoFreq).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([m])=>m);
    if (topMono.length > 0)
      chars.add(`Monetisation: ${topMono.join(', ')}`);

    // Shared decision signal
    const recFreq = {};
    scored.forEach(s => { const r = s.sig.build_rec; if (r && r !== 'unknown') recFreq[r] = (recFreq[r]||0)+1; });
    const topRec = Object.entries(recFreq).sort((a,b)=>b[1]-a[1])[0];
    if (topRec && topRec[1] >= 2)
      chars.add(`Decision pattern: ${topRec[0]} (${topRec[1]} projects)`);

    // Shared relevant keywords
    if (relevant.length > 0)
      chars.add(`Common signals: ${relevant.slice(0,4).join(', ')}`);

    // Fallback if nothing specific detected
    if (chars.size === 0)
      chars.add(`${scored.length} project${scored.length > 1 ? 's' : ''} share cluster signals`);

    return {
      cluster_name:            def.name,
      projects,
      shared_characteristics:  [...chars].slice(0, 5),
      cluster_score,
    };
  }).filter(Boolean);  // remove null (empty) clusters
}


// ═══════════════════════════════════════════════════
// SECTION 5h — Graph Visualisation Data Builder (Phase 4.3)
// ═══════════════════════════════════════════════════

/**
 * NODE_TYPE_PRIORITY
 *
 * Maps cluster names to node type identifiers used by D3 / React Flow.
 * Priority order determines which type a node is assigned when it
 * belongs to multiple clusters (first match wins).
 */
const NODE_TYPE_PRIORITY = Object.freeze([
  { cluster: 'AI Tools',             type: 'ai_tools'           },
  { cluster: 'SaaS',                 type: 'saas'               },
  { cluster: 'Automation Systems',   type: 'automation'         },
  { cluster: 'Education Platforms',  type: 'education'          },
  { cluster: 'Business Systems',     type: 'business_systems'   },
]);

/**
 * VIABILITY_WEIGHT
 *
 * Converts viability string → numeric contribution (0–30).
 * Used in importance_score computation.
 */
const VIABILITY_WEIGHT = Object.freeze({
  high:    30,
  medium:  15,
  low:      5,
});

/**
 * BUILD_REC_WEIGHT
 *
 * Converts build_recommendation string → numeric contribution (0–20).
 * Used in importance_score computation.
 */
const BUILD_REC_WEIGHT = Object.freeze({
  scale:   20,
  improve: 14,
  pivot:    8,
  avoid:    2,
});

/**
 * buildVisualisationData(kg, clusterMembership)
 *
 * Transforms the internal knowledge graph into a UI-ready structure
 * optimised for D3.js and React Flow graph renderers.
 *
 * Parameters:
 *   kg               — the full knowledge_graph object (nodes, edges, clusters)
 *   clusterMembership — Map<nodeId, string[]> of cluster names per node
 *                       (pre-computed from intelligence_clusters)
 *
 * Returns:
 *   graph_visualisation_data: { nodes: [], edges: [] }
 *
 * Output node shape:
 *   { id, label, type, importance_score }
 *
 * Output edge shape:
 *   { from, to, weight, type }
 *
 * Fully deterministic. No AI calls. No external data.
 */
function buildVisualisationData(kg, clusterMembership) {
  const inNodes  = kg.nodes  || [];
  const inEdges  = kg.edges  || [];

  if (inNodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  // ── Pre-compute degree map (edge count per node) ──
  // Degree = total number of edges touching a node, across all types.
  const degreeMap = new Map();
  inNodes.forEach(n => degreeMap.set(n.id, 0));
  inEdges.forEach(e => {
    degreeMap.set(e.from, (degreeMap.get(e.from) || 0) + 1);
    degreeMap.set(e.to,   (degreeMap.get(e.to)   || 0) + 1);
  });

  // Max degree for normalisation (avoid div/0 when only 1 node)
  const maxDegree = Math.max(1, ...degreeMap.values());

  // ── Build vis nodes ──
  const visNodes = inNodes.map(n => {
    // label — use stored name, fall back to hostname, then id
    const label = n.name && n.name !== 'Unknown'
      ? n.name
      : (n.url ? (() => { try { return new URL(n.url).hostname; } catch { return n.id; } })() : n.id);

    // type — first matching cluster from priority list, else 'unclustered'
    const memberClusters = clusterMembership.get(n.id) || [];
    let type = 'unclustered';
    for (const entry of NODE_TYPE_PRIORITY) {
      if (memberClusters.includes(entry.cluster)) { type = entry.type; break; }
    }

    // importance_score — weighted composite (0–100 integer):
    //   degree contribution   : 40% — how connected this node is
    //   viability             : 30% — project quality signal
    //   build_recommendation  : 20% — decision signal
    //   cluster membership    : 10% — breadth of categorisation
    const degreeScore   = Math.round((degreeMap.get(n.id) || 0) / maxDegree * 100);
    const viaScore      = VIABILITY_WEIGHT[n.viability]   || 0;
    const recScore      = BUILD_REC_WEIGHT[n.build_rec]   || 0;
    const clusterScore  = Math.min(10, memberClusters.length * 4);  // 0,4,8,10

    const importance_score = Math.min(100, Math.round(
      degreeScore  * 0.40 +
      viaScore     * 1.00 +   // already on 0-30 scale → contributes directly
      recScore     * 1.00 +   // already on 0-20 scale → contributes directly
      clusterScore * 1.00     // already on 0-10 scale → contributes directly
    ));

    return {
      id:               n.id,
      label,
      type,
      importance_score: Math.max(1, importance_score),  // floor at 1 (visible node)
    };
  });

  // ── Build vis edges ──
  const visEdges = inEdges.map(e => ({
    from:   e.from,
    to:     e.to,
    weight: parseFloat((e.strength / 100).toFixed(2)),  // 0.00–1.00, 2dp
    type:   e.type,
  }));

  return { nodes: visNodes, edges: visEdges };
}

/**
 * buildClusterMembership(intelligence_clusters)
 *
 * Inverts the clusters array into a Map<nodeId, clusterName[]>.
 * Used by buildVisualisationData to assign node types efficiently.
 */
function buildClusterMembership(intelligence_clusters) {
  const map = new Map();
  (intelligence_clusters || []).forEach(cl => {
    // cl.projects contains node names (not IDs) — we need IDs.
    // The mapping is done at the buildKnowledgeGraph level where we have both.
    // This Map is keyed by name here; remapped to id below in buildKnowledgeGraph.
    (cl.projects || []).forEach(name => {
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(cl.cluster_name);
    });
  });
  return map;
}

function buildKnowledgeGraph(allProjects) {
  const validProjects = allProjects.filter(p => p.analysis && p.id);

  if (validProjects.length === 0) {
    return { ...GRAPH_FALLBACK.knowledge_graph };
  }

  // Build nodes
  const nodes = validProjects.map(buildGraphNode);

  // Build enriched signatures for all projects
  const sigs = validProjects.map(enrichSignature);

  // Pairwise edge inference — O(n²) but n is small (local app, ≤100 projects)
  const edgeMap = new Map();  // edgeId → edge (deduplication)
  for (let i = 0; i < sigs.length; i++) {
    for (let j = i + 1; j < sigs.length; j++) {
      const newEdges = inferEdges(sigs[i], sigs[j], nodes[i], nodes[j]);
      newEdges.forEach(e => {
        const eid = edgeId(e.from, e.to, e.type);
        // If duplicate (shouldn't happen, but guard), keep higher-strength
        if (!edgeMap.has(eid) || edgeMap.get(eid).strength < e.strength) {
          edgeMap.set(eid, e);
        }
      });
    }
  }

  const edges = [...edgeMap.values()]
    .sort((a, b) => b.strength - a.strength);  // highest strength first

  // ── Intelligence Clusters ──
  // Derived from the same nodes+sigs already built above — no extra reads.
  const intelligence_clusters = buildIntelligenceClusters(nodes, sigs);

  // ── Graph Visualisation Data ──
  // Build cluster membership map keyed by node NAME (as stored in cl.projects).
  // Remap to node ID so buildVisualisationData can look up by ID.
  const membershipByName = buildClusterMembership(intelligence_clusters);
  const clusterMembership = new Map();
  nodes.forEach(n => {
    const clusters = membershipByName.get(n.name) || [];
    clusterMembership.set(n.id, clusters);
  });
  const graph_visualisation_data = buildVisualisationData(
    { nodes, edges, intelligence_clusters },
    clusterMembership
  );

  return { nodes, edges, intelligence_clusters, graph_visualisation_data };
}


// ═══════════════════════════════════════════════════
// SECTION 5i — Semantic Memory Engine (Phase 5)
// ═══════════════════════════════════════════════════

/**
 * STRATEGIC_ROLE_TYPES
 *
 * Canonical set of valid strategic role identifiers.
 * Priority order matters — first matching rule wins in inferStrategicRole().
 */
const STRATEGIC_ROLE_TYPES = Object.freeze([
  'core_system',
  'ai_agent_system',
  'automation_system',
  'business_platform',
  'support_tool',
  'experimental_system',
]);

/**
 * STRATEGIC_ROLE_RULES
 *
 * Priority-ordered rules for strategic role inference.
 * Each rule contains:
 *   role      — the role to assign if matched
 *   signals   — keyword tokens to match against the project's full signal pool
 *   minScore  — minimum token-match count required (after tokenise)
 *   clusterMatch — optional cluster name; if present, boosts match by 3
 *
 * Evaluation stops at first match. Falls back to 'experimental_system'.
 * No external data. No AI calls. Fully deterministic.
 */
const STRATEGIC_ROLE_RULES = Object.freeze([
  {
    role: 'ai_agent_system',
    signals: [
      'artificial intelligence','machine learning','neural','language model',
      'generative','gpt','llm','embedding','inference','classifier',
      'agent','agentic','ai','model','openai','anthropic','nlp',
      'chatbot','recommendation','prediction','computer vision',
    ],
    minScore: 3,
    clusterMatch: 'AI Tools',
  },
  {
    role: 'automation_system',
    signals: [
      'automation','workflow','trigger','webhook','scheduler','cron',
      'bot','rpa','robotic','orchestration','no-code','low-code',
      'automate','event-driven','queue','batch','pipeline','integration',
    ],
    minScore: 3,
    clusterMatch: 'Automation Systems',
  },
  {
    role: 'core_system',
    signals: [
      'core','infrastructure','platform','foundation','engine','runtime',
      'framework','database','backend','api','service','microservice',
      'primary','central','enterprise','mission-critical','saas',
    ],
    minScore: 4,
    clusterMatch: 'SaaS',
  },
  {
    role: 'business_platform',
    signals: [
      'crm','erp','accounting','invoicing','payroll','analytics','reporting',
      'business intelligence','kpi','finance','billing','sales','pipeline',
      'lead','customer','management','marketplace','commerce','ecommerce',
    ],
    minScore: 3,
    clusterMatch: 'Business Systems',
  },
  {
    role: 'support_tool',
    signals: [
      'tool','utility','helper','assistant','widget','plugin','extension',
      'productivity','management','tracking','monitoring','dashboard',
      'notification','alert','browser','chrome','addon','integration',
    ],
    minScore: 3,
    clusterMatch: null,
  },
]);

/**
 * buildSignalPool(sig, raw)
 *
 * Assembles a unified Set of lowercase tokens from the full
 * Phase 1–4 intelligence stack for a single project.
 * Used by both inferStrategicRole and extractConceptTags.
 */
function buildSignalPool(sig, raw) {
  return tokeniseArr([
    sig.industry             || '',
    sig.category             || '',
    sig.monetisation         || '',
    sig.growth_traj          || '',
    sig.risk_level           || '',
    sig.opportunity_rating   || '',
    sig.viability            || '',
    sig.build_rec            || '',
    ...(raw.revenue_streams         || []),
    ...(raw.inferred_stack          || []),
    ...(raw.scaling_opportunities   || []),
    ...(raw.expansion_ideas         || []),
    ...(raw.strongest_opportunities || []),
    ...(raw.architecture_type       || []),
    ...(raw.complexity_rating       || []),
    ...(raw.pricing_signals         || []),
    ...(raw.partnership_potential   || []),
    ...(raw.valuation_indicators    || []),
    ...(raw.investment_signals      || []),
    ...(raw.market_opportunity      || []),
    ...(raw.operational_concerns    || []),
    ...(raw.market_risks            || []),
    ...sig.strengths,
    ...sig.key_risks,
    ...sig.insights,
  ]);
}

/**
 * inferStrategicRole(sig, raw, memberClusters)
 *
 * Evaluates STRATEGIC_ROLE_RULES in priority order.
 * Returns the first matching role, or 'experimental_system' as fallback.
 *
 * Scoring per rule:
 *   Each signal token from the rule that appears in the project's signal pool
 *   counts as 1. A matching clusterMatch adds 3 to the score.
 *   Score >= rule.minScore → rule matches.
 */
function inferStrategicRole(sig, raw, memberClusters) {
  const pool = buildSignalPool(sig, raw);

  for (const rule of STRATEGIC_ROLE_RULES) {
    // Tokenise rule signals into individual terms (handle multi-word phrases)
    const ruleTokens = tokeniseArr(rule.signals);

    let score = 0;
    ruleTokens.forEach(t => { if (pool.has(t)) score++; });
    if (rule.clusterMatch && memberClusters.includes(rule.clusterMatch)) score += 3;

    if (score >= rule.minScore) return rule.role;
  }

  return 'experimental_system';
}

/**
 * extractConceptTags(sig, raw, memberClusters)
 *
 * Derives a deduplicated array of concept tags from the full signal pool.
 * Tags are sourced from 5 tiers (highest signal first):
 *   1. Cluster names the project belongs to
 *   2. Industry + category (if non-generic)
 *   3. Monetisation model
 *   4. Top inferred stack tokens (≤3)
 *   5. Top revenue stream tokens (≤3)
 * Returns up to 10 tags, lowercased, deduplicated.
 */
function extractConceptTags(sig, raw, memberClusters) {
  const tags = new Set();

  // Tier 1: cluster names
  memberClusters.forEach(c => tags.add(c.toLowerCase().replace(/\s+/g, '_')));

  // Tier 2: industry / category
  const ind = (sig.industry || '').toLowerCase().trim();
  const cat = (sig.category || '').toLowerCase().trim();
  if (ind && ind !== 'unknown') tags.add(ind);
  if (cat && cat !== 'unknown' && cat !== ind) tags.add(cat);

  // Tier 3: monetisation
  const mono = (sig.monetisation || '').toLowerCase().trim();
  if (mono && mono !== 'unknown') tags.add(mono);

  // Tier 4: inferred stack (top 3 tokens)
  tokeniseArr(raw.inferred_stack || [])
    [Symbol.iterator] && [...tokeniseArr(raw.inferred_stack || [])]
      .filter(t => t.length > 4)
      .slice(0, 3)
      .forEach(t => tags.add(t));

  // Tier 5: revenue streams (top 3 tokens)
  tokeniseArr(raw.revenue_streams || [])
    [Symbol.iterator] && [...tokeniseArr(raw.revenue_streams || [])]
      .filter(t => t.length > 4)
      .slice(0, 3)
      .forEach(t => tags.add(t));

  // viability + build_rec as signal tags
  const via = (sig.viability  || '').toLowerCase().trim();
  const rec = (sig.build_rec  || '').toLowerCase().trim();
  if (via && via !== 'unknown') tags.add(`viability:${via}`);
  if (rec && rec !== 'unknown') tags.add(`build:${rec}`);

  return [...tags].slice(0, 10);
}

/**
 * inferFunctionalIdentity(sig, raw)
 *
 * Constructs a one-sentence functional identity string from the
 * most specific available intelligence fields.
 * Deterministic — same input always produces the same output.
 */
function inferFunctionalIdentity(sig, raw) {
  const cat  = sig.category    && sig.category    !== 'Unknown' ? sig.category    : null;
  const ind  = sig.industry    && sig.industry    !== 'Unknown' ? sig.industry    : null;
  const mono = sig.monetisation && sig.monetisation !== 'unknown' ? sig.monetisation : null;
  const rec  = sig.build_rec   && sig.build_rec   !== 'unknown' ? sig.build_rec   : null;
  const via  = sig.viability   && sig.viability   !== 'unknown' ? sig.viability   : null;

  const parts = [];
  if (cat && ind && cat !== ind) parts.push(`${cat} in the ${ind} space`);
  else if (cat)                  parts.push(`${cat} product`);
  else if (ind)                  parts.push(`${ind} product`);
  else                           parts.push('digital product');

  if (mono)  parts.push(`monetised via ${mono}`);
  if (via)   parts.push(`viability rated ${via}`);
  if (rec)   parts.push(`recommendation: ${rec}`);

  // Top opportunity signal
  const topOpp = (raw.strongest_opportunities || raw.scaling_opportunities || [])[0];
  if (topOpp) parts.push(`key opportunity: ${topOpp.toLowerCase().slice(0, 60)}`);

  return parts.join('; ') + '.';
}

/**
 * buildMeaningVector(sig, raw, strategicRole, memberClusters)
 *
 * Constructs a rich natural-language meaning representation
 * from the full Phase 1–4 intelligence stack.
 * This is NOT an AI embedding — it is a deterministic structured
 * text summary designed for pattern-matching, clustering, and
 * future semantic search operations.
 *
 * Format: a pipe-delimited key=value string for easy parsing.
 */
function buildMeaningVector(sig, raw, strategicRole, memberClusters) {
  const parts = [];

  parts.push(`role=${strategicRole}`);

  const ind  = sig.industry    && sig.industry    !== 'Unknown' ? sig.industry    : 'unknown';
  const cat  = sig.category    && sig.category    !== 'Unknown' ? sig.category    : 'unknown';
  const mono = sig.monetisation && sig.monetisation !== 'unknown' ? sig.monetisation : 'unknown';
  const via  = sig.viability   && sig.viability   !== 'unknown' ? sig.viability   : 'unknown';
  const rec  = sig.build_rec   && sig.build_rec   !== 'unknown' ? sig.build_rec   : 'unknown';
  const risk = sig.risk_level  && sig.risk_level  !== 'unknown' ? sig.risk_level  : 'unknown';
  const grow = sig.growth_traj && sig.growth_traj !== 'unknown' ? sig.growth_traj : 'unknown';

  parts.push(`industry=${ind}`);
  parts.push(`category=${cat}`);
  parts.push(`monetisation=${mono}`);
  parts.push(`viability=${via}`);
  parts.push(`build_rec=${rec}`);
  parts.push(`risk=${risk}`);
  parts.push(`growth=${grow}`);

  if (sig.scores) {
    parts.push(`score_business=${sig.scores.business  || 0}`);
    parts.push(`score_technical=${sig.scores.technical || 0}`);
    parts.push(`score_investor=${sig.scores.investor  || 0}`);
  }

  if (memberClusters.length > 0)
    parts.push(`clusters=${memberClusters.join(',')}`);

  const topStack = [...tokeniseArr(raw.inferred_stack || [])].slice(0, 3).join(',');
  if (topStack) parts.push(`stack=${topStack}`);

  const topOpps = (raw.strongest_opportunities || raw.scaling_opportunities || []).slice(0, 2)
    .map(s => s.toLowerCase().replace(/[|=]/g, ' ').slice(0, 40)).join(' | ');
  if (topOpps) parts.push(`opportunities=${topOpps}`);

  const topRisks = (raw.market_risks || raw.operational_concerns || []).slice(0, 2)
    .map(s => s.toLowerCase().replace(/[|=]/g, ' ').slice(0, 40)).join(' | ');
  if (topRisks) parts.push(`risks=${topRisks}`);

  return parts.join(' | ');
}

/**
 * buildSemanticMemory(project, clusterMembership)
 *
 * Entry point — constructs the full semantic_memory object for one project.
 * Reads only from stored Phase 1–4 data. No AI calls. No external data.
 * Deterministic given the same stored project state.
 *
 * Parameters:
 *   project          — full stored project record
 *   clusterMembership — Map<projectId, clusterName[]> (from buildKnowledgeGraph)
 *
 * Returns:
 *   { meaning_vector, concept_tags, functional_identity, strategic_role }
 */
function buildSemanticMemory(project, clusterMembership) {
  try {
    const sig = enrichSignature(project);
    const raw = sig._raw || {};
    const memberClusters = clusterMembership.get(project.id) || [];

    const strategic_role     = inferStrategicRole(sig, raw, memberClusters);
    const concept_tags       = extractConceptTags(sig, raw, memberClusters);
    const functional_identity = inferFunctionalIdentity(sig, raw);
    const meaning_vector     = buildMeaningVector(sig, raw, strategic_role, memberClusters);

    return { meaning_vector, concept_tags, functional_identity, strategic_role };
  } catch (e) {
    console.warn('[AP3XVER5E] buildSemanticMemory failed for project:', project.id, e.message);
    return { ...SEMANTIC_FALLBACK.semantic_memory };
  }
}


// ═══════════════════════════════════════════════════
// SECTION 5j — Cross-Project Reasoning Engine (Phase 6)
// ═══════════════════════════════════════════════════

/**
 * VIABILITY_SCORE_MAP / BUILD_REC_SCORE_MAP
 *
 * Convert string signals into numeric contributions
 * for scoreProjectStrength(). Mirrors the weights used
 * in buildVisualisationData so importance scores stay
 * consistent across subsystems.
 */
const VIABILITY_SCORE_MAP = Object.freeze({ high: 30, medium: 15, low: 5 });
const BUILD_REC_SCORE_MAP = Object.freeze({ scale: 20, improve: 14, pivot: 8, avoid: 2 });

/**
 * scoreProjectStrength(sig)
 *
 * Computes a single composite strength score (0–100) from
 * existing Phase 1–4 intelligence fields stored in a signature.
 *
 * Formula (all components already 0-based, no external data):
 *   40% — mean of all 5 Phase 2 numeric scores (business, technical,
 *           investor, scalability, innovation)
 *   30% — viability string → numeric (VIABILITY_SCORE_MAP, max 30)
 *   20% — build_rec string → numeric (BUILD_REC_SCORE_MAP, max 20)
 *   10% — opportunity_rating: high=10, medium=5, low=1, else 0
 *
 * Returns an integer 0–100. No AI. No external data.
 */
function scoreProjectStrength(sig) {
  const s = sig.scores || {};
  const meanScore = Math.round(
    ((s.business || 0) + (s.technical || 0) + (s.investor || 0) +
     (s.scalability || 0) + (s.innovation || 0)) / 5
  );

  const viaScore = VIABILITY_SCORE_MAP[sig.viability]    || 0;
  const recScore = BUILD_REC_SCORE_MAP[sig.build_rec]    || 0;
  const oppScore = sig.opportunity_rating === 'high'   ? 10
                 : sig.opportunity_rating === 'medium' ?  5
                 : sig.opportunity_rating === 'low'    ?  1 : 0;

  return Math.min(100, Math.max(0, Math.round(
    meanScore * 0.40 + viaScore + recScore + oppScore
  )));
}

/**
 * findRepeatedPatterns(sigs)
 *
 * Discovers patterns that appear across ≥2 projects by
 * counting token frequency across the full signal pool of
 * every project in the portfolio.
 *
 * Pattern sources (tiered by signal quality):
 *   T1 — industry + category (most specific)
 *   T2 — monetisation model
 *   T3 — top inferred_stack tokens
 *   T4 — build_rec + viability + risk_level signals
 *   T5 — top strength tokens
 *
 * Returns up to 8 pattern strings formatted as human-readable
 * labels, sorted by frequency descending. Tokens shorter than
 * 4 chars or on the stop-list are excluded.
 */
const PATTERN_STOP_WORDS = new Set([
  'unknown','other','none','n/a','the','and','for','with','from',
  'this','that','have','been','will','also','some','more','high',
  'low','medium','true','false','yes','no','not','can','are','all',
]);

function findRepeatedPatterns(sigs) {
  if (sigs.length < 2) return [];

  const freq = new Map();   // token → count of projects containing it
  const proj = new Map();   // token → Set of project names (for label building)

  sigs.forEach(sig => {
    const raw = sig._raw || {};
    const pool = new Set([
      sig.industry, sig.category, sig.monetisation,
      sig.build_rec, sig.viability, sig.risk_level,
      ...tokeniseArr([sig.industry, sig.category, sig.monetisation]),
      ...tokeniseArr(raw.inferred_stack       || []),
      ...tokeniseArr(raw.revenue_streams      || []),
      ...sig.strengths,
    ]);
    pool.forEach(t => {
      if (!t || t.length < 4 || PATTERN_STOP_WORDS.has(t)) return;
      freq.set(t, (freq.get(t) || 0) + 1);
      if (!proj.has(t)) proj.set(t, new Set());
      proj.get(t).add(sig.id);
    });
  });

  // Keep tokens seen in ≥2 projects, sort by frequency desc
  const repeated = [...freq.entries()]
    .filter(([, c]) => c >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

  // Format as human-readable pattern labels
  return repeated.map(([token, count]) =>
    `${token} (found across ${count} project${count > 1 ? 's' : ''})`
  );
}

/**
 * computeSkillDominanceMap(sigs)
 *
 * Computes four skill dimension scores across the full portfolio.
 * Each score is the mean of per-project values, rounded to an integer.
 *
 *   technical    — mean of technical_score (Phase 2)
 *   business     — mean of business_score (Phase 2)
 *   architecture — mean of (scalability_score + innovation_score) / 2
 *   ai_systems   — mean of technical_score for projects in AI cluster
 *                  (identified by strategic_role = 'ai_agent_system'
 *                   OR inferred_stack containing AI tokens);
 *                  falls back to mean innovation_score if no AI projects
 *
 * Returns { technical, business, architecture, ai_systems } — all integers 0–100.
 * No AI calls. No external data.
 */
function computeSkillDominanceMap(sigs) {
  if (sigs.length === 0)
    return { technical: 0, business: 0, architecture: 0, ai_systems: 0 };

  const mean = arr => arr.length === 0 ? 0
    : Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);

  const technical    = mean(sigs.map(s => s.scores?.technical   || 0));
  const business     = mean(sigs.map(s => s.scores?.business    || 0));
  const architecture = mean(sigs.map(s =>
    Math.round(((s.scores?.scalability || 0) + (s.scores?.innovation || 0)) / 2)
  ));

  // AI-system projects: those whose inferred_stack overlaps AI tokens
  const AI_TOKENS = new Set(['ai','llm','gpt','ml','neural','embedding','nlp','openai','anthropic','generative']);
  const aiSigs = sigs.filter(s => {
    const stack = tokeniseArr((s._raw?.inferred_stack) || []);
    return [...stack].some(t => AI_TOKENS.has(t));
  });
  const ai_systems = aiSigs.length > 0
    ? mean(aiSigs.map(s => s.scores?.technical || 0))
    : mean(sigs.map(s => s.scores?.innovation  || 0));

  return {
    technical:    Math.min(100, technical),
    business:     Math.min(100, business),
    architecture: Math.min(100, architecture),
    ai_systems:   Math.min(100, ai_systems),
  };
}

/**
 * buildPortfolioSummary(sigs, strongest, weakest, patterns, skillMap)
 *
 * Constructs a deterministic natural-language summary of the portfolio
 * from computed reasoning outputs. No AI call.
 *
 * Template-driven: fills in concrete values from the data,
 * with conditional branches for edge cases (single project, no patterns, etc.).
 */
function buildPortfolioSummary(sigs, strongest, weakest, patterns, skillMap) {
  const n = sigs.length;
  if (n === 0) return 'No projects analysed yet.';
  if (n === 1) {
    const s = sigs[0];
    return `Portfolio contains 1 project (${s.category || s.industry || 'unknown category'}). ` +
           `Insufficient data for cross-project reasoning — analyse more projects to unlock patterns.`;
  }

  // Dominant skill
  const skillEntries = Object.entries(skillMap).sort(([,a],[,b]) => b - a);
  const topSkill = skillEntries[0];
  const skillLabel = { technical: 'technical depth', business: 'business acumen',
    architecture: 'architectural thinking', ai_systems: 'AI systems engineering' }[topSkill[0]] || topSkill[0];

  // Industry breadth
  const industries = new Set(sigs.map(s => s.industry).filter(i => i && i !== 'unknown'));
  const industryPhrase = industries.size === 1
    ? `concentrated in ${[...industries][0]}`
    : `spanning ${industries.size} industries (${[...industries].slice(0, 3).join(', ')}${industries.size > 3 ? '...' : ''})`;

  // Strongest pattern
  const topPattern = patterns[0] ? `The most repeated pattern is: ${patterns[0].replace(/ \(found across.*\)/, '')}.` : '';

  // Build rec distribution
  const recCounts = {};
  sigs.forEach(s => { recCounts[s.build_rec] = (recCounts[s.build_rec] || 0) + 1; });
  const topRec = Object.entries(recCounts).sort(([,a],[,b]) => b-a)[0];
  const recPhrase = topRec ? `${topRec[1]} of ${n} project${n>1?'s':''} recommend: ${topRec[0]}` : '';

  const parts = [
    `Portfolio of ${n} projects ${industryPhrase}.`,
    `Dominant skill: ${skillLabel} (score: ${topSkill[1]}).`,
    strongest.length > 0 ? `Strongest: ${strongest.slice(0, 2).join(', ')}.` : '',
    weakest.length   > 0 ? `Needs attention: ${weakest.slice(0, 1).join(', ')}.` : '',
    topPattern,
    recPhrase ? `Decision signals — ${recPhrase}.` : '',
  ];

  return parts.filter(Boolean).join(' ');
}

/**
 * buildCrossProjectReasoning(allProjects)
 *
 * Entry point — computes the full cross_project_reasoning object
 * from all stored projects. Reads only from existing Phase 1–5 data.
 * No AI calls. No external data. Fully deterministic.
 *
 * Parameters:
 *   allProjects — full array from dbGetAll()
 *
 * Returns:
 *   {
 *     strongest_projects:  string[],   ← project names, top 3 by strength
 *     weakest_projects:    string[],   ← project names, bottom 3 by strength
 *     repeated_patterns:   string[],   ← up to 8 cross-project pattern labels
 *     skill_dominance_map: { technical, business, architecture, ai_systems },
 *     portfolio_summary:   string
 *   }
 */
function buildCrossProjectReasoning(allProjects) {
  // Only reason over projects that have at least Phase 2 analysis
  const validProjects = allProjects.filter(p => p.analysis && p.id && p.analysis.technical_score);

  if (validProjects.length === 0) {
    return { ...REASONING_FALLBACK.cross_project_reasoning };
  }

  // Build enriched signatures for all projects
  const sigs = validProjects.map(enrichSignature);

  // Attach project name to each sig for human-readable output
  sigs.forEach((sig, i) => {
    const a = validProjects[i].analysis || {};
    const dt = validProjects[i].digital_twin || {};
    sig._name = a.project_name
      || dt.intelligence_fusion?.project_name
      || (validProjects[i].url ? (() => {
        try { return new URL(validProjects[i].url).hostname; } catch { return validProjects[i].id; }
      })() : validProjects[i].id);
  });

  // Score each project
  const scored = sigs
    .map(sig => ({ sig, score: scoreProjectStrength(sig) }))
    .sort((a, b) => b.score - a.score);

  // Strongest projects (top 3, score ≥ 40)
  const strongest_projects = scored
    .filter(({ score }) => score >= 40)
    .slice(0, 3)
    .map(({ sig }) => sig._name);

  // Weakest projects (bottom 3, score < 40 — or bottom 3 overall if all strong)
  const weakCandidates = scored.filter(({ score }) => score < 40);
  const weakest_projects = (weakCandidates.length > 0 ? weakCandidates : scored.slice(-3))
    .slice(-3)
    .reverse()
    .map(({ sig }) => sig._name);

  // Pattern detection
  const repeated_patterns = findRepeatedPatterns(sigs);

  // Skill dominance
  const skill_dominance_map = computeSkillDominanceMap(sigs);

  // Portfolio summary
  const portfolio_summary = buildPortfolioSummary(
    sigs, strongest_projects, weakest_projects, repeated_patterns, skill_dominance_map
  );

  return {
    strongest_projects,
    weakest_projects,
    repeated_patterns,
    skill_dominance_map,
    portfolio_summary,
  };
}


// ═══════════════════════════════════════════════════
// SECTION 5k — Portfolio Intelligence Report Engine (Phase 7)
// ═══════════════════════════════════════════════════

/**
 * ROLE_TO_DISTRIBUTION_BUCKET
 *
 * Maps Phase 5 strategic_role values to the four
 * portfolio_distribution buckets in the spec.
 * Any unmapped role lands in 'experimental'.
 */
const ROLE_TO_DISTRIBUTION_BUCKET = Object.freeze({
  'ai_agent_system':    'ai_systems',
  'automation_system':  'automation_tools',
  'business_platform':  'business_systems',
  'core_system':        'business_systems',
  'support_tool':       'automation_tools',
  'experimental_system':'experimental',
});

/**
 * classifyProjectDistribution(sigs)
 *
 * Counts how many projects fall into each of the four
 * distribution buckets using the strategic_role stored
 * in the project's semantic_memory (Phase 5).
 *
 * Falls back to 'experimental' for any project whose
 * semantic_memory is absent (legacy record).
 *
 * Returns { ai_systems, automation_tools, business_systems, experimental }
 * — all integers, sum = number of valid projects.
 */
function classifyProjectDistribution(validProjects) {
  const counts = { ai_systems: 0, automation_tools: 0, business_systems: 0, experimental: 0 };
  validProjects.forEach(p => {
    const role = p.analysis?.semantic_memory?.strategic_role
              || p.digital_twin?.semantic_memory?.strategic_role
              || 'experimental_system';
    const bucket = ROLE_TO_DISTRIBUTION_BUCKET[role] || 'experimental';
    counts[bucket]++;
  });
  return counts;
}

/**
 * computeInnovationScore(sigs)
 *
 * Portfolio-level innovation score = mean of all projects'
 * Phase 2 innovation_score values, rounded and clamped 0–100.
 */
function computeInnovationScore(sigs) {
  if (sigs.length === 0) return 0;
  const total = sigs.reduce((sum, s) => sum + (s.scores?.innovation || 0), 0);
  return Math.min(100, Math.max(0, Math.round(total / sigs.length)));
}

/**
 * computeConsistencyScore(sigs)
 *
 * Measures how consistent the portfolio's decision signals
 * are across projects. High consistency = low variance.
 *
 * Algorithm:
 *   1. Compute variance of technical_score across all projects.
 *   2. Compute variance of business_score across all projects.
 *   3. Measure build_rec agreement: fraction of projects sharing
 *      the modal build_rec value.
 *   4. Measure viability agreement: fraction sharing modal viability.
 *
 *   consistency = 100 - (normalised_score_variance * 0.4)
 *                      + (build_rec_agreement * 30)
 *                      + (viability_agreement * 30)
 *
 * Returns integer 0–100. Higher = more consistent portfolio.
 */
function computeConsistencyScore(sigs) {
  if (sigs.length < 2) return sigs.length === 1 ? 70 : 0;

  const techScores = sigs.map(s => s.scores?.technical || 0);
  const bizScores  = sigs.map(s => s.scores?.business  || 0);

  const variance = arr => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
  };

  // Variance contribution: normalise by max possible variance (50^2 = 2500)
  const normVar = (variance(techScores) + variance(bizScores)) / 2 / 2500;

  // Modal agreement for categorical fields
  const modalFraction = arr => {
    const freq = {};
    arr.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
    const max = Math.max(...Object.values(freq));
    return max / arr.length;
  };

  const buildRecAgreement   = modalFraction(sigs.map(s => s.build_rec  || 'unknown'));
  const viabilityAgreement  = modalFraction(sigs.map(s => s.viability  || 'unknown'));

  const score = Math.round(
    (1 - normVar) * 40
    + buildRecAgreement  * 30
    + viabilityAgreement * 30
  );

  return Math.min(100, Math.max(0, score));
}

/**
 * inferPortfolioIdentity(distribution, skillMap, sigs)
 *
 * Determines a one-sentence identity label for the portfolio
 * based on which project type dominates and which skill
 * dimension leads. Fully deterministic template selection.
 *
 * Returns a string describing what kind of builder/portfolio this is.
 */
function inferPortfolioIdentity(distribution, skillMap, sigs) {
  if (sigs.length === 0) return 'Empty portfolio — no projects analysed yet.';

  // Find dominant distribution bucket
  const distEntries  = Object.entries(distribution).sort(([,a],[,b]) => b - a);
  const topBucket    = distEntries[0][0];
  const topCount     = distEntries[0][1];
  const total        = sigs.length;
  const dominantPct  = Math.round((topCount / total) * 100);

  // Find dominant skill dimension
  const skillEntries = Object.entries(skillMap).sort(([,a],[,b]) => b - a);
  const topSkill     = skillEntries[0][0];

  const bucketLabel = {
    ai_systems:       'AI systems builder',
    automation_tools: 'automation engineer',
    business_systems: 'business platform architect',
    experimental:     'experimental systems creator',
  }[topBucket] || 'full-stack builder';

  const skillLabel = {
    technical:    'technical depth',
    business:     'business thinking',
    architecture: 'architectural vision',
    ai_systems:   'AI engineering',
  }[topSkill] || 'cross-domain thinking';

  if (total === 1)
    return `Single-project portfolio — ${sigs[0].category || sigs[0].industry || 'unknown'} space. Insufficient data for pattern identity.`;

  if (dominantPct >= 70)
    return `Focused ${bucketLabel} with ${dominantPct}% concentration, leading in ${skillLabel}.`;

  if (distEntries.filter(([,c]) => c > 0).length >= 3)
    return `Diversified builder across ${distEntries.filter(([,c]) => c > 0).length} domains, strongest in ${skillLabel}.`;

  return `Dual-domain ${bucketLabel}, primarily ${distEntries[0][0].replace('_',' ')} and ${distEntries[1][0].replace('_',' ')}, with ${skillLabel} as core strength.`;
}

/**
 * extractKeyStrengths(sigs, skillMap, patterns)
 *
 * Derives up to 5 key strength statements from:
 *   - Skill dominance (top 2 skill dimensions)
 *   - High-scoring projects (technical or business score ≥ 70)
 *   - Consistent build_rec signals
 *   - Repeated patterns count
 *   - Viability distribution
 *
 * Returns string[] — each item is a human-readable strength statement.
 */
function extractKeyStrengths(sigs, skillMap, patterns) {
  const strengths = [];

  // Skill dimension strengths
  const skillEntries = Object.entries(skillMap).sort(([,a],[,b]) => b - a);
  const skillLabels = {
    technical:'Technical execution', business:'Business model thinking',
    architecture:'Architectural scalability', ai_systems:'AI systems expertise',
  };
  if (skillEntries[0][1] >= 60)
    strengths.push(`${skillLabels[skillEntries[0][0]] || skillEntries[0][0]} (portfolio mean: ${skillEntries[0][1]}/100)`);
  if (skillEntries[1] && skillEntries[1][1] >= 55)
    strengths.push(`${skillLabels[skillEntries[1][0]] || skillEntries[1][0]} (portfolio mean: ${skillEntries[1][1]}/100)`);

  // High-scoring projects
  const highTech = sigs.filter(s => (s.scores?.technical || 0) >= 70).length;
  if (highTech > 0)
    strengths.push(`${highTech} project${highTech > 1 ? 's' : ''} with high technical score (≥70)`);

  // Build rec consistency
  const scaleCnt = sigs.filter(s => s.build_rec === 'scale').length;
  if (scaleCnt >= 2)
    strengths.push(`${scaleCnt} projects assessed as scale-ready`);

  // Pattern depth
  if (patterns.length >= 3)
    strengths.push(`Strong pattern consistency (${patterns.length} repeated signals across portfolio)`);

  // High viability count
  const highVia = sigs.filter(s => s.viability === 'high').length;
  if (highVia >= 2)
    strengths.push(`${highVia} projects with high viability rating`);

  return strengths.slice(0, 5);
}

/**
 * extractKeyGaps(sigs, skillMap, distribution)
 *
 * Identifies up to 5 gap signals from:
 *   - Weak skill dimensions (score < 40)
 *   - High proportion of 'avoid' or 'pivot' build_recs
 *   - Low viability concentration
 *   - Missing domain coverage
 *   - Low innovation score
 *
 * Returns string[] — each item is a human-readable gap statement.
 */
function extractKeyGaps(sigs, skillMap, distribution) {
  const gaps = [];
  if (sigs.length === 0) return gaps;

  // Weak skill dimensions
  const skillLabels = {
    technical:'Technical depth', business:'Business model clarity',
    architecture:'Architectural scalability', ai_systems:'AI systems capability',
  };
  Object.entries(skillMap)
    .filter(([,v]) => v < 40)
    .sort(([,a],[,b]) => a - b)
    .slice(0, 2)
    .forEach(([k, v]) => gaps.push(`Weak ${skillLabels[k] || k} (portfolio mean: ${v}/100)`));

  // Avoid/pivot concentration
  const avoidPivot = sigs.filter(s => s.build_rec === 'avoid' || s.build_rec === 'pivot').length;
  if (avoidPivot > 0 && avoidPivot / sigs.length >= 0.3)
    gaps.push(`${avoidPivot} project${avoidPivot > 1 ? 's' : ''} flagged as avoid or pivot`);

  // Low viability concentration
  const lowVia = sigs.filter(s => s.viability === 'low').length;
  if (lowVia > 0)
    gaps.push(`${lowVia} project${lowVia > 1 ? 's' : ''} with low viability rating`);

  // Missing domain coverage (zero in a bucket)
  const emptyBuckets = Object.entries(distribution)
    .filter(([,c]) => c === 0)
    .map(([k]) => k.replace('_', ' '));
  if (emptyBuckets.length > 0 && sigs.length >= 3)
    gaps.push(`No coverage in: ${emptyBuckets.join(', ')}`);

  // Low innovation scores
  const lowInn = sigs.filter(s => (s.scores?.innovation || 0) < 40).length;
  if (lowInn >= 2)
    gaps.push(`${lowInn} projects with low innovation score (<40) — consider differentiation`);

  return gaps.slice(0, 5);
}

/**
 * buildTechnicalStrengthAnalysis(sigs, skillMap)
 *
 * Constructs a deterministic prose paragraph describing
 * the portfolio's technical profile. Draws from:
 *   - computeSkillDominanceMap results
 *   - Mean technical + scalability + innovation scores
 *   - Most common inferred_stack tokens across all projects
 *   - Architecture type distribution
 *
 * No AI call. Same input → same output.
 */
function buildTechnicalStrengthAnalysis(sigs, skillMap) {
  if (sigs.length === 0) return 'No projects available for technical analysis.';

  const mean = arr => arr.length === 0 ? 0
    : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

  const techMean  = mean(sigs.map(s => s.scores?.technical   || 0));
  const scaleMean = mean(sigs.map(s => s.scores?.scalability || 0));
  const innMean   = mean(sigs.map(s => s.scores?.innovation  || 0));

  // Most common stack tokens across all projects
  const stackFreq = new Map();
  sigs.forEach(s => {
    tokeniseArr(s._raw?.inferred_stack || []).forEach(t => {
      if (t.length > 3) stackFreq.set(t, (stackFreq.get(t) || 0) + 1);
    });
  });
  const topStack = [...stackFreq.entries()]
    .sort(([,a],[,b]) => b - a)
    .slice(0, 4)
    .map(([t]) => t);

  // Architecture types
  const archTypes = sigs
    .flatMap(s => s._raw?.architecture_type || [])
    .filter(Boolean);
  const archFreq = new Map();
  archTypes.forEach(a => archFreq.set(a, (archFreq.get(a) || 0) + 1));
  const topArch = [...archFreq.entries()].sort(([,a],[,b]) => b - a)[0]?.[0] || null;

  // Compose paragraph
  const techLevel = techMean >= 70 ? 'strong' : techMean >= 50 ? 'solid' : 'developing';
  const scaleLevel = scaleMean >= 65 ? 'well-architected for scale'
                   : scaleMean >= 45 ? 'moderately scalable'
                   : 'may require architectural investment';
  const innLevel = innMean >= 65 ? 'high innovation differentiation'
                 : innMean >= 45 ? 'moderate innovation signals'
                 : 'limited innovation differentiation';

  const parts = [
    `Portfolio technical profile: ${techLevel} (mean score ${techMean}/100).`,
    `Scalability posture: ${scaleLevel} (mean ${scaleMean}/100).`,
    innLevel.charAt(0).toUpperCase() + innLevel.slice(1) + ` (mean ${innMean}/100).`,
  ];

  if (topStack.length > 0)
    parts.push(`Dominant technology signals: ${topStack.join(', ')}.`);
  if (topArch)
    parts.push(`Most common architecture pattern: ${topArch}.`);
  if (skillMap.ai_systems >= 60)
    parts.push(`AI systems capability is a standout strength (score: ${skillMap.ai_systems}/100).`);

  return parts.join(' ');
}

/**
 * buildPortfolioOverview(sigs, distribution, innovationScore, consistencyScore)
 *
 * Constructs a 2-3 sentence overview of the entire portfolio
 * from computed metrics. Deterministic template selection.
 */
function buildPortfolioOverview(sigs, distribution, innovationScore, consistencyScore) {
  const n = sigs.length;
  if (n === 0) return 'No projects have been analysed yet.';

  const nonEmpty   = Object.entries(distribution).filter(([,c]) => c > 0);
  const domainPhrase = nonEmpty.length === 1
    ? `${nonEmpty[0][1]} ${nonEmpty[0][0].replace('_',' ')} project${nonEmpty[0][1] > 1 ? 's' : ''}`
    : `${n} projects across ${nonEmpty.length} domains`;

  const innovPhrase = innovationScore >= 65 ? 'high-innovation'
                    : innovationScore >= 45 ? 'moderately innovative'
                    : 'early-stage';
  const consistPhrase = consistencyScore >= 70 ? 'highly consistent decision signals'
                      : consistencyScore >= 50 ? 'moderately consistent strategic direction'
                      : 'diverse and exploratory strategic signals';

  return (
    `Portfolio of ${domainPhrase} with ${innovPhrase} characteristics (innovation index: ${innovationScore}/100). ` +
    `Strategic direction shows ${consistPhrase} (consistency index: ${consistencyScore}/100). ` +
    `${n === 1 ? 'Single project portfolio — grow your project count to unlock full portfolio intelligence.' : `Analysed ${n} projects, revealing cross-system patterns and builder skill profile.`}`
  );
}

/**
 * buildPortfolioIntelligenceReport(allProjects)
 *
 * Entry point — assembles the full portfolio_intelligence_report
 * from all stored projects. Reads only from Phase 1–6 stored data.
 * No AI calls. No external data. Fully deterministic.
 *
 * Parameters:
 *   allProjects — full array from dbGetAll()
 *
 * Returns the spec-exact object:
 *   {
 *     overview, project_distribution, technical_strength_analysis,
 *     innovation_score, consistency_score, portfolio_identity,
 *     key_strengths, key_gaps
 *   }
 */
function buildPortfolioIntelligenceReport(allProjects) {
  // Need at least Phase 2 scores to reason meaningfully
  const validProjects = allProjects.filter(p => p.analysis && p.id && p.analysis.technical_score);

  if (validProjects.length === 0) {
    return { ...PORTFOLIO_FALLBACK.portfolio_intelligence_report };
  }

  // Build enriched signatures for all projects
  const sigs = validProjects.map(p => {
    const sig = enrichSignature(p);
    // Attach project name for human-readable output
    const a  = p.analysis      || {};
    const dt = p.digital_twin  || {};
    sig._name = a.project_name
      || dt.intelligence_fusion?.project_name
      || (() => { try { return new URL(p.url).hostname; } catch { return p.id; } })();
    return sig;
  });

  // Phase 6 cross-project reasoning output (if available on any project)
  const cpr = validProjects
    .map(p => p.analysis?.cross_project_reasoning || p.digital_twin?.cross_project_reasoning)
    .find(r => r && r.skill_dominance_map);
  const skillMap = cpr?.skill_dominance_map || computeSkillDominanceMap(sigs);
  const patterns = cpr?.repeated_patterns   || findRepeatedPatterns(sigs);

  // Compute all report fields
  const project_distribution          = classifyProjectDistribution(validProjects);
  const innovation_score              = computeInnovationScore(sigs);
  const consistency_score             = computeConsistencyScore(sigs);
  const portfolio_identity            = inferPortfolioIdentity(project_distribution, skillMap, sigs);
  const key_strengths                 = extractKeyStrengths(sigs, skillMap, patterns);
  const key_gaps                      = extractKeyGaps(sigs, skillMap, project_distribution);
  const technical_strength_analysis   = buildTechnicalStrengthAnalysis(sigs, skillMap);
  const overview                      = buildPortfolioOverview(sigs, project_distribution, innovation_score, consistency_score);

  return {
    overview,
    project_distribution,
    technical_strength_analysis,
    innovation_score,
    consistency_score,
    portfolio_identity,
    key_strengths,
    key_gaps,
  };
}


// ═══════════════════════════════════════════════════
// SECTION 5l — Portfolio Visual Map Engine (Phase 8)
// ═══════════════════════════════════════════════════

/**
 * RELATIONSHIP_TYPE_LABELS
 *
 * Human-readable label map for the 5 Phase 4 edge types.
 * Used in buildVisualMapConnections to populate relationship_type.
 */
const RELATIONSHIP_TYPE_LABELS = Object.freeze({
  SIMILAR_TO:           'similar_to',
  SAME_INDUSTRY:        'same_industry',
  SHARED_FEATURES:      'shared_features',
  SHARED_RISKS:         'shared_risks',
  SHARED_OPPORTUNITIES: 'shared_opportunities',
});

/**
 * buildVisualMapNodes(validProjects, kg)
 *
 * Constructs the spec-exact nodes array for portfolio_visual_map.
 * Reads from Phase 4 KG nodes (already computed) and Phase 5
 * semantic_memory for strategic_role.
 *
 * Node shape:
 *   id              — project id (stable key)
 *   label           — project name or hostname
 *   category        — Phase 4 category (industry/category from MAI)
 *   importance_score — 0–100 integer (scoreProjectStrength re-used)
 *   strategic_role  — Phase 5 semantic_memory.strategic_role
 *
 * No AI calls. Fully derived from stored data.
 */
function buildVisualMapNodes(validProjects, kg) {
  // Build a lookup map from Phase 4 KG nodes for fast access
  const kgNodeMap = new Map((kg.nodes || []).map(n => [n.id, n]));

  return validProjects.map(project => {
    const kgNode = kgNodeMap.get(project.id) || {};
    const a      = project.analysis     || {};
    const dt     = project.digital_twin || {};

    // label — Phase 4 node name → hostname fallback → id
    const label = kgNode.name && kgNode.name !== 'Unknown'
      ? kgNode.name
      : (() => { try { return new URL(project.url || '').hostname; } catch { return project.id; } })();

    // category — from Phase 4 KG node (already resolved from MAI)
    const category = kgNode.category || a.multi_agent_intelligence?.research?.category || 'Unknown';

    // importance_score — reuse Phase 6 scoreProjectStrength on enriched sig
    let importance_score = 0;
    try {
      const sig = enrichSignature(project);
      importance_score = scoreProjectStrength(sig);
    } catch (_) {
      // fallback: mean of Phase 2 numeric scores
      const s = [
        parseInt(a.business_score,    10) || 0,
        parseInt(a.technical_score,   10) || 0,
        parseInt(a.investor_score,    10) || 0,
        parseInt(a.scalability_score, 10) || 0,
        parseInt(a.innovation_score,  10) || 0,
      ];
      importance_score = Math.round(s.reduce((acc, v) => acc + v, 0) / 5);
    }

    // strategic_role — from Phase 5 semantic_memory
    const strategic_role =
      a.semantic_memory?.strategic_role  ||
      dt.semantic_memory?.strategic_role ||
      'experimental_system';

    return {
      id:               project.id,
      label,
      category,
      importance_score: Math.min(100, Math.max(0, importance_score)),
      strategic_role,
    };
  });
}

/**
 * buildVisualMapConnections(kg)
 *
 * Maps Phase 4 KG edges directly to the spec-exact connections array.
 * No recomputation — reads stored edges from the knowledge_graph.
 *
 * Connection shape:
 *   from              — source project id
 *   to                — target project id
 *   relationship_type — normalised lowercase label (from RELATIONSHIP_TYPE_LABELS)
 *   strength          — integer 0–100 (Phase 4 composite edge strength)
 *
 * Sorted by strength descending so strongest connections appear first.
 */
function buildVisualMapConnections(kg) {
  const edges = kg.edges || [];
  return edges
    .map(e => ({
      from:              e.from,
      to:                e.to,
      relationship_type: RELATIONSHIP_TYPE_LABELS[e.type] || e.type?.toLowerCase() || 'similar_to',
      strength:          Math.min(100, Math.max(0, Math.round(e.strength || 0))),
    }))
    .sort((a, b) => b.strength - a.strength);
}

/**
 * buildVisualMapClusters(kg)
 *
 * Maps Phase 4 intelligence_clusters directly to the spec-exact
 * clusters array. No recomputation.
 *
 * Cluster shape:
 *   cluster_name — Phase 4 cluster name (e.g. 'AI Tools', 'SaaS')
 *   projects     — array of project names in this cluster
 *   theme        — derived from shared_characteristics (top 3, joined)
 *
 * Only includes clusters with ≥1 project. Sorted by project count desc.
 */
function buildVisualMapClusters(kg) {
  const clusters = kg.intelligence_clusters || [];
  return clusters
    .filter(cl => (cl.projects || []).length > 0)
    .map(cl => ({
      cluster_name: cl.cluster_name || 'Unknown',
      projects:     cl.projects     || [],
      theme:        (cl.shared_characteristics || []).slice(0, 3).join(', ') || cl.cluster_name || '',
    }))
    .sort((a, b) => b.projects.length - a.projects.length);
}

/**
 * buildPortfolioVisualMap(allProjects)
 *
 * Entry point — builds the spec-exact portfolio_visual_map object
 * from all stored projects. Reads Phase 4 knowledge_graph stored
 * on projects — no KG recomputation unless unavailable.
 *
 * Priority for KG source:
 *   1. Most recently stored KG across all projects (has intelligence_clusters)
 *   2. Any stored KG (has nodes+edges only)
 *   3. Fresh buildKnowledgeGraph() call if none stored
 *
 * Returns:
 *   { nodes, connections, clusters }
 *   — spec-exact, all fields typed, no AI calls
 */
function buildPortfolioVisualMap(allProjects) {
  // Filter to projects with at least a URL and ID
  const validProjects = allProjects.filter(p => p.id && (p.analysis || p.digital_twin));

  if (validProjects.length === 0) {
    return { ...VISUAL_MAP_FALLBACK.portfolio_visual_map };
  }

  // ── Resolve Knowledge Graph ──
  // Use the stored KG from the most capable project (has intelligence_clusters).
  // Avoids recomputing an O(n²) graph unnecessarily.
  let kg = null;

  // Priority 1: project with intelligence_clusters (Phase 4.2+)
  for (const p of validProjects) {
    const stored = p.analysis?.knowledge_graph || p.digital_twin?.knowledge_graph;
    if (stored?.intelligence_clusters?.length > 0) { kg = stored; break; }
  }

  // Priority 2: any stored KG with nodes
  if (!kg) {
    for (const p of validProjects) {
      const stored = p.analysis?.knowledge_graph || p.digital_twin?.knowledge_graph;
      if (stored?.nodes?.length > 0) { kg = stored; break; }
    }
  }

  // Priority 3: recompute (fresh portfolio, no KG stored yet)
  if (!kg) {
    kg = buildKnowledgeGraph(allProjects);
  }

  // ── Build all three map components ──
  const nodes       = buildVisualMapNodes(validProjects, kg);
  const connections = buildVisualMapConnections(kg);
  const clusters    = buildVisualMapClusters(kg);

  return { nodes, connections, clusters };
}


// ═══════════════════════════════════════════════════
// SECTION 5m — Reasoning Explanation Layer (Phase 9 — Reasoning Trace)
// ═══════════════════════════════════════════════════

function detectKeySignals(a, mai, fus, dec) {
  const signals = [];
  const scores = {
    business:    parseInt(a.business_score,    10) || 0,
    technical:   parseInt(a.technical_score,   10) || 0,
    investor:    parseInt(a.investor_score,    10) || 0,
    scalability: parseInt(a.scalability_score, 10) || 0,
    innovation:  parseInt(a.innovation_score,  10) || 0,
  };
  Object.entries(scores).forEach(([dim, val]) => {
    if (val >= 70) signals.push('High ' + dim + ' score detected (' + val + '/100)');
    else if (val < 40 && val > 0) signals.push('Low ' + dim + ' score flagged (' + val + '/100)');
  });
  const viability = (dec.viability || '').toLowerCase();
  if (viability && viability !== 'unknown')
    signals.push('Viability assessed as "' + viability + '" by decision engine');
  const riskLevel = (mai.risk?.overall_risk_level || '').toLowerCase();
  if (riskLevel && riskLevel !== 'unknown')
    signals.push('Risk level determined to be "' + riskLevel + '" by risk agent');
  const growth = (mai.growth?.growth_trajectory || '').toLowerCase();
  if (growth && growth !== 'unknown')
    signals.push('Growth trajectory identified as "' + growth + '" by growth agent');
  const opp = (mai.business?.opportunity_rating || '').toLowerCase();
  if (opp && opp !== 'unknown')
    signals.push('Opportunity rated "' + opp + '" by business agent');
  const bm = (a.business_model || a.report_business?.revenue_model || '').trim();
  if (bm && bm.toLowerCase() !== 'unknown')
    signals.push('Business model identified as: ' + bm);
  const complexity = (mai.technical?.complexity_rating || '').toLowerCase();
  if (complexity && complexity !== 'unknown')
    signals.push('Technical complexity rated "' + complexity + '" by technical agent');
  const contradictions = (fus.contradictions || []).filter(c => c && !c.toLowerCase().includes('no contradiction'));
  if (contradictions.length > 0)
    signals.push(contradictions.length + ' agent contradiction(s) detected during intelligence fusion');
  const funding = (mai.investor?.funding_potential || '').toLowerCase();
  if (funding && funding !== 'unknown')
    signals.push('Investor agent rated funding potential as "' + funding + '"');
  return signals.slice(0, 8);
}

function buildDecisionPath(a, mai, fus, dec) {
  const projectName = a.project_name || 'Unknown Project';
  const industry    = (mai.research?.industry  || 'an unidentified industry').toLowerCase();
  const category    = (mai.research?.category  || 'an unidentified category').toLowerCase();
  const purpose     = (mai.research?.purpose   || 'unknown purpose').toLowerCase();
  const mono        = (mai.business?.monetisation_model || 'unknown monetisation').toLowerCase();
  const viability   = (dec.viability           || 'unknown').toLowerCase();
  const buildRec    = (dec.build_recommendation || 'unknown').toLowerCase();
  const confidence  = parseInt(dec.confidence_score, 10) || 0;
  const uSummary    = (fus.unified_summary || '').slice(0, 120).trim();
  const topOpp      = (fus.strongest_opportunities || [])[0] || 'no clear opportunity identified';
  const topRisk     = (fus.biggest_risks           || [])[0] || 'no dominant risk identified';
  return [
    'Step 1 — Content ingested: "' + projectName + '" identified as a ' + category + ' in the ' + industry + ' sector, serving ' + purpose + '.',
    'Step 2 — Phase 2 reports generated: five structured intelligence reports produced covering overview, business (' + mono + '), technical, investor, and improvement roadmap dimensions.',
    'Step 3 — Six specialised agents executed: research, business, technical, investor, risk, and growth agents independently analysed the project and produced structured JSON outputs.',
    'Step 4 — Intelligence fused: agent outputs synthesised into a unified view' + (uSummary ? ' — "' + uSummary + (uSummary.length >= 120 ? '..."' : '"') : '') + '.',
    'Step 5 — Decision derived: viability set to "' + viability + '", build recommendation "' + buildRec + '", confidence ' + confidence + '/100. Primary opportunity: ' + topOpp + '. Primary risk: ' + topRisk + '.',
    'Step 6 — Reasoning trace generated: all signal sources, assumptions, and confidence factors documented from stored Phase 1-5 data without additional inference.',
  ];
}

function extractConfidenceDrivers(a, mai, fus, dec) {
  const drivers = [];
  const scores = [
    parseInt(a.business_score,    10) || 0,
    parseInt(a.technical_score,   10) || 0,
    parseInt(a.investor_score,    10) || 0,
    parseInt(a.scalability_score, 10) || 0,
    parseInt(a.innovation_score,  10) || 0,
  ].filter(s => s > 0);
  if (scores.length > 0) {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, v) => sum + (v - mean) ** 2, 0) / scores.length;
    const stdDev = Math.round(Math.sqrt(variance));
    if (stdDev <= 10)
      drivers.push('High score consistency across all 5 dimensions (std dev: ' + stdDev + ') — increased confidence');
    else if (stdDev >= 25)
      drivers.push('High score variance across dimensions (std dev: ' + stdDev + ') — reduced confidence');
    else
      drivers.push('Moderate score consistency across dimensions (std dev: ' + stdDev + ')');
  }
  const contradictions = (fus.contradictions || []).filter(c => c && !c.toLowerCase().includes('no contradiction'));
  if (contradictions.length === 0)
    drivers.push('No agent contradictions detected — all six agents produced aligned signals');
  else
    drivers.push(contradictions.length + ' agent contradiction(s) found — reduced confidence in conflicting dimensions');
  const p1Defaults = ['Unknown Project', 'Unknown', 'Analysis could not be completed'];
  const projectName = a.project_name || '';
  const hasGoodData = !p1Defaults.some(d => projectName.includes(d));
  if (hasGoodData)
    drivers.push('Sufficient page content extracted — Phase 1 fields fully populated');
  else
    drivers.push('Limited page content available — some Phase 1 fields defaulted, reducing confidence');
  const viability = (dec.viability || '').toLowerCase();
  const meanScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const expectedViability = meanScore >= 65 ? 'high' : meanScore >= 45 ? 'medium' : 'low';
  if (viability === expectedViability)
    drivers.push('Viability "' + viability + '" aligns with mean score of ' + meanScore + '/100 — consistent decision signal');
  else if (viability && viability !== 'unknown')
    drivers.push('Viability "' + viability + '" differs from score-implied "' + expectedViability + '" (mean: ' + meanScore + '/100) — agents overrode numeric signal');
  const fusScore = parseInt(fus.overall_intelligence_score, 10) || 0;
  if (fusScore > 0)
    drivers.push('Intelligence fusion confidence score: ' + fusScore + '/100');
  return drivers.slice(0, 5);
}

function extractAssumptionsMade(a, mai, fus) {
  const assumptions = [];
  const stack = (mai.technical?.inferred_stack || []).filter(s => s && !s.toLowerCase().includes('unable'));
  if (stack.length > 0)
    assumptions.push('Tech stack inferred (not confirmed): ' + stack.slice(0, 3).join(', '));
  const arch = (mai.technical?.architecture_type || '').toLowerCase();
  if (arch && arch !== 'unknown')
    assumptions.push('Architecture type assumed from signals: "' + arch + '"');
  const marketType = (a.report_business?.market_type || '').toLowerCase();
  if (marketType && marketType !== 'unknown')
    assumptions.push('Market type inferred from page content: "' + marketType + '"');
  const competitors = (a.competitor_analysis?.possible_competitors || []).filter(c => c && !c.toLowerCase().includes('assumed'));
  if (competitors.length > 0)
    assumptions.push('Competitor names inferred from industry/category signals (unverified): ' + competitors.slice(0, 2).join(', '));
  else
    assumptions.push('Competitor analysis based on industry category — specific competitors not confirmed');
  const revModel = (a.report_business?.revenue_model || mai.business?.monetisation_model || '').toLowerCase();
  if (revModel && revModel !== 'unknown')
    assumptions.push('Revenue model assumed from business signals: "' + revModel + '"');
  return assumptions.slice(0, 5);
}

function buildFinalReasoningSummary(a, mai, fus, dec, sig) {
  const projectName = a.project_name || 'This project';
  const industry    = (mai.research?.industry  || 'an unidentified industry').toLowerCase();
  const category    = (mai.research?.category  || 'category').toLowerCase();
  const buildRec    = (dec.build_recommendation || 'unknown').toLowerCase();
  const viability   = (dec.viability           || 'unknown').toLowerCase();
  const confidence  = parseInt(dec.confidence_score, 10) || 0;
  const meanScore   = Math.round(
    ([a.business_score, a.technical_score, a.investor_score, a.scalability_score, a.innovation_score]
      .map(s => parseInt(s, 10) || 0)
      .reduce((sum, v) => sum + v, 0)) / 5
  );
  const topInsight  = (fus.key_insights || [])[0] || '';
  const topStrength = (a.insight_summary?.strengths || [])[0] || '';
  const topRisk     = (a.insight_summary?.risks || [])[0] || (mai.risk?.key_risks || [])[0] || '';
  const reasoning   = (dec.reasoning_summary || '').trim();
  const contradictions = (fus.contradictions || []).filter(c => c && !c.toLowerCase().includes('no contradiction')).length;
  const parts = [projectName + ' was analysed as a ' + category + ' operating in the ' + industry + ' sector.'];
  if (meanScore > 0) parts.push('Across five intelligence dimensions, the mean score was ' + meanScore + '/100.');
  if (topStrength)   parts.push('The primary strength detected was: ' + topStrength + '.');
  if (topRisk)       parts.push('The primary risk identified was: ' + topRisk + '.');
  if (topInsight)    parts.push("The fusion layer's key insight: " + topInsight + '.');
  if (contradictions > 0) parts.push(contradictions + ' contradiction(s) were noted between agents, which factored into the confidence assessment.');
  parts.push('The decision engine concluded viability is "' + viability + '" with a build recommendation of "' + buildRec + '" at ' + confidence + '/100 confidence.');
  if (reasoning && reasoning.length > 20 && !reasoning.toLowerCase().includes('could not')) parts.push(reasoning);
  return parts.join(' ');
}

function buildReasoningTrace(project) {
  const a   = project.analysis           || {};
  const mai = a.multi_agent_intelligence || {};
  const fus = a.intelligence_fusion      || {};
  const dec = a.decision_engine          || {};
  if (!a.project_name) return { ...TRACE_FALLBACK.reasoning_trace };
  let sig = null;
  try { sig = enrichSignature(project); } catch (_) { sig = {}; }
  const key_signals_detected    = detectKeySignals(a, mai, fus, dec);
  const decision_path           = buildDecisionPath(a, mai, fus, dec);
  const confidence_drivers      = extractConfidenceDrivers(a, mai, fus, dec);
  const assumptions_made        = extractAssumptionsMade(a, mai, fus);
  const final_reasoning_summary = buildFinalReasoningSummary(a, mai, fus, dec, sig);
  return { key_signals_detected, decision_path, confidence_drivers, assumptions_made, final_reasoning_summary };
}


// ═══════════════════════════════════════════════════
// SECTION 5n — Confidence & Uncertainty Model (Phase 10)
// ═══════════════════════════════════════════════════

// Default sentinel values — used to detect un-populated fields
const UNKNOWN_SENTINELS = new Set([
  'unknown', 'unable to determine.', 'insufficient data.',
  'no signals detected.', 'unable to determine', 'insufficient data',
]);
function isSentinel(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'number') return v === 0;
  if (Array.isArray(v)) return v.length === 0 || v.every(isSentinel);
  return UNKNOWN_SENTINELS.has(String(v).toLowerCase().trim());
}

/**
 * scoreBusiness(a, mai)
 * Returns 0-100 confidence that the business_model field is reliable.
 * Weights: Phase 2 score 40%, monetisation populated 20%,
 *          revenue_streams non-default 20%, market_type non-default 20%.
 */
function scoreBusiness(a, mai) {
  const scoreBase  = Math.min(100, Math.max(0, parseInt(a.business_score, 10) || 0));
  const monoOk     = !isSentinel(mai.business?.monetisation_model) ? 1 : 0;
  const revenueOk  = !isSentinel(mai.business?.revenue_streams)    ? 1 : 0;
  const marketOk   = !isSentinel(a.report_business?.market_type)   ? 1 : 0;
  return Math.round(scoreBase * 0.40 + monoOk * 20 + revenueOk * 20 + marketOk * 20);
}

/**
 * scoreTechnical(a, mai)
 * Returns 0-100 confidence that the technical_analysis field is reliable.
 * Weights: Phase 2 score 40%, inferred_stack 20%, complexity_rating 20%,
 *          architecture_type 20%.
 */
function scoreTechnical(a, mai) {
  const scoreBase   = Math.min(100, Math.max(0, parseInt(a.technical_score, 10) || 0));
  const stackOk     = !isSentinel(mai.technical?.inferred_stack)    ? 1 : 0;
  const complexOk   = !isSentinel(mai.technical?.complexity_rating) ? 1 : 0;
  const archOk      = !isSentinel(mai.technical?.architecture_type) ? 1 : 0;
  return Math.round(scoreBase * 0.40 + stackOk * 20 + complexOk * 20 + archOk * 20);
}

/**
 * scoreInvestor(a, mai)
 * Returns 0-100 confidence that the investor_readiness field is reliable.
 * Weights: Phase 2 score 40%, funding_potential 25%,
 *          investment_signals 20%, valuation_indicators 15%.
 */
function scoreInvestor(a, mai) {
  const scoreBase    = Math.min(100, Math.max(0, parseInt(a.investor_score, 10) || 0));
  const fundingOk    = !isSentinel(mai.investor?.funding_potential)    ? 1 : 0;
  const signalsOk    = !isSentinel(mai.investor?.investment_signals)   ? 1 : 0;
  const valuationOk  = !isSentinel(mai.investor?.valuation_indicators) ? 1 : 0;
  return Math.round(scoreBase * 0.40 + fundingOk * 25 + signalsOk * 20 + valuationOk * 15);
}

/**
 * scoreRisk(a, mai)
 * Returns 0-100 confidence that the risk_analysis field is reliable.
 * Weights: innovation_score (proxy for signal richness) 30%,
 *          key_risks non-default 30%, overall_risk_level non-default 20%,
 *          operational_concerns non-default 20%.
 */
function scoreRisk(a, mai) {
  const scoreBase    = Math.min(100, Math.max(0, parseInt(a.innovation_score, 10) || 0));
  const risksOk      = !isSentinel(mai.risk?.key_risks)             ? 1 : 0;
  const riskLevelOk  = !isSentinel(mai.risk?.overall_risk_level)    ? 1 : 0;
  const opsOk        = !isSentinel(mai.risk?.operational_concerns)  ? 1 : 0;
  return Math.round(scoreBase * 0.30 + risksOk * 30 + riskLevelOk * 20 + opsOk * 20);
}

/**
 * buildUncertaintyFlags(a, mai, fus, dec)
 * Scans Phase 1-5 stored data for explicit evidence of uncertainty.
 * Returns string[] — each flag is a human-readable statement of a gap.
 * Never returns fake precision. If no genuine gaps exist, returns [].
 */
function buildUncertaintyFlags(a, mai, fus, dec) {
  const flags = [];

  // Phase 1 data quality
  if (isSentinel(a.project_name))
    flags.push('Project name could not be extracted — all downstream analysis affected');
  if (isSentinel(a.business_model))
    flags.push('Business model not identified from page content — Phase 2 business report may be unreliable');
  if (isSentinel(a.target_audience))
    flags.push('Target audience unclear — investor and business confidence reduced');

  // Phase 2 zero-score detection (no fake precision)
  const zeroScores = ['business_score','technical_score','investor_score','scalability_score','innovation_score']
    .filter(k => !(parseInt(a[k], 10) > 0));
  if (zeroScores.length >= 3)
    flags.push('Three or more Phase 2 scores are zero — insufficient signal extracted from page');
  else if (zeroScores.length > 0)
    flags.push('Score(s) defaulted to zero for: ' + zeroScores.join(', ') + ' — partial signal only');

  // Phase 3 agent gaps
  if (isSentinel(mai.research?.industry))
    flags.push('Industry could not be determined — research agent returned unknown');
  if (isSentinel(mai.technical?.inferred_stack))
    flags.push('Tech stack could not be inferred — technical confidence limited to score only');
  if (isSentinel(mai.investor?.funding_potential))
    flags.push('Funding potential unknown — investor agent had insufficient signals');
  if (isSentinel(mai.risk?.overall_risk_level))
    flags.push('Overall risk level not assessed — risk agent returned unknown');

  // Phase 3 contradictions between agents
  const contradictions = (fus.contradictions || []).filter(c =>
    c && !c.toLowerCase().includes('no contradiction'));
  if (contradictions.length >= 2)
    flags.push(contradictions.length + ' inter-agent contradictions detected — conflicting signals reduce reliability');

  // Decision engine low confidence
  const decConf = parseInt(dec.confidence_score, 10) || 0;
  if (decConf > 0 && decConf < 40)
    flags.push('Decision engine confidence score is low (' + decConf + '/100) — recommendation should be treated as indicative only');

  // Inferred-only stack (explicitly flagged as assumption)
  const stack = (mai.technical?.inferred_stack || []);
  const stackIsInferred = stack.length > 0 && !isSentinel(stack) &&
    stack.some(s => s.toLowerCase().includes('inferred') || s.toLowerCase().includes('assumed'));
  if (stackIsInferred)
    flags.push('Tech stack is inferred from signals, not confirmed — technical analysis is assumption-based');

  return flags;
}

/**
 * buildLowConfidenceAreas(fieldConf, flags)
 * Returns string[] naming areas where confidence < 50 or a matching
 * uncertainty flag is present. No fake precision — only genuine gaps named.
 */
function buildLowConfidenceAreas(fieldConf, flags) {
  const areas = [];
  const FIELD_LABELS = {
    business_model:     'Business model analysis',
    technical_analysis: 'Technical analysis',
    investor_readiness: 'Investor readiness',
    risk_analysis:      'Risk analysis',
  };
  Object.entries(fieldConf).forEach(([field, score]) => {
    if (score < 50) areas.push(FIELD_LABELS[field] + ' (confidence: ' + score + '/100)');
  });
  // Add areas implied by flags that aren't already covered by score
  if (flags.some(f => f.includes('project name')))
    areas.push('Project identification (name not extracted)');
  if (flags.some(f => f.includes('contradictions')))
    areas.push('Inter-agent consistency (contradictions detected)');
  return [...new Set(areas)]; // deduplicate
}

/**
 * buildReliabilitySummary(overall, fieldConf, flags, dec)
 * One plain-English sentence per confidence tier that accurately
 * represents what the system knows and doesn't know.
 * No invented claims. Grounded in actual computed values only.
 */
function buildReliabilitySummary(overall, fieldConf, flags, dec) {
  const decConf = parseInt(dec.confidence_score, 10) || 0;
  const weakAreas = Object.entries(fieldConf)
    .filter(([, v]) => v < 50)
    .map(([k]) => k.replace(/_/g, ' '));

  if (overall >= 70) {
    const strong = Object.entries(fieldConf).filter(([, v]) => v >= 70).map(([k]) => k.replace(/_/g, ' '));
    return 'High reliability — sufficient signal extracted across most dimensions'
      + (strong.length > 0 ? ', particularly in ' + strong.slice(0, 2).join(' and ') : '')
      + (flags.length > 0 ? '. ' + flags.length + ' uncertainty flag(s) noted but do not materially reduce confidence.' : '.');
  }
  if (overall >= 45) {
    return 'Moderate reliability — core intelligence captured but confidence is uneven'
      + (weakAreas.length > 0 ? '; lowest confidence in ' + weakAreas.slice(0, 2).join(' and ') : '')
      + (flags.length > 0 ? '. ' + flags.length + ' uncertainty flag(s) should be reviewed before acting on this analysis.' : '.');
  }
  return 'Low reliability — insufficient signals extracted from this URL'
    + (weakAreas.length > 0 ? '; ' + weakAreas.slice(0, 3).join(', ') + ' are particularly unreliable' : '')
    + (decConf > 0 ? '. Decision engine confidence: ' + decConf + '/100.' : '. Treat all outputs as provisional.');
}

/**
 * buildConfidenceModel(project)
 * Entry point — assembles the spec-exact confidence_model object.
 * Reads only project.analysis + stored Phase 3 data.
 * No AI calls. No external data. Deterministic.
 *
 * Returns:
 *   {
 *     overall_confidence:  number  0-100
 *     field_confidence:    { business_model, technical_analysis, investor_readiness, risk_analysis }
 *     uncertainty_flags:   string[]
 *     low_confidence_areas:string[]
 *     reliability_summary: string
 *   }
 */
function buildConfidenceModel(project) {
  const a   = project.analysis           || {};
  const mai = a.multi_agent_intelligence || {};
  const fus = a.intelligence_fusion      || {};
  const dec = a.decision_engine          || {};

  // Guard: nothing to assess without at least Phase 2 scores
  const hasAnyScore = ['business_score','technical_score','investor_score',
    'scalability_score','innovation_score'].some(k => parseInt(a[k], 10) > 0);
  if (!hasAnyScore) {
    return { ...CONFIDENCE_FALLBACK.confidence_model };
  }

  // ── Field-level confidence scores ──
  const field_confidence = {
    business_model:     scoreBusiness(a, mai),
    technical_analysis: scoreTechnical(a, mai),
    investor_readiness: scoreInvestor(a, mai),
    risk_analysis:      scoreRisk(a, mai),
  };

  // ── Overall confidence: mean of the four field scores ──
  const overall_confidence = Math.round(
    Object.values(field_confidence).reduce((s, v) => s + v, 0) / 4
  );

  // ── Uncertainty flags ──
  const uncertainty_flags = buildUncertaintyFlags(a, mai, fus, dec);

  // ── Low confidence areas ──
  const low_confidence_areas = buildLowConfidenceAreas(field_confidence, uncertainty_flags);

  // ── Reliability summary ──
  const reliability_summary = buildReliabilitySummary(
    overall_confidence, field_confidence, uncertainty_flags, dec
  );

  return {
    overall_confidence,
    field_confidence,
    uncertainty_flags,
    low_confidence_areas,
    reliability_summary,
  };
}


// ═══════════════════════════════════════════════════
// SECTION 5o — Project Comparison Engine (Phase 11)
// ═══════════════════════════════════════════════════

/**
 * compareWinnerByCategory(sigA, sigB, nameA, nameB)
 *
 * For each of the four spec categories, determines which project
 * scores higher using stored Phase 2 numeric scores only.
 * Ties reported explicitly. Never invents data.
 *
 * Returns winner_by_category: { technical, business, scalability, investor_potential }
 */
function compareWinnerByCategory(sigA, sigB, nameA, nameB) {
  const win = (scoreA, scoreB, labelA, labelB) => {
    if (scoreA === 0 && scoreB === 0) return 'Insufficient data for both';
    if (scoreA === 0) return labelB + ' (no data for ' + labelA + ')';
    if (scoreB === 0) return labelA + ' (no data for ' + labelB + ')';
    const delta = scoreA - scoreB;
    if (Math.abs(delta) <= 3) return 'Tie (' + scoreA + ' vs ' + scoreB + ')';
    return (delta > 0 ? labelA : labelB) + ' (' + Math.max(scoreA, scoreB) + ' vs ' + Math.min(scoreA, scoreB) + ')';
  };
  return {
    technical:          win(sigA.scores.technical,   sigB.scores.technical,   nameA, nameB),
    business:           win(sigA.scores.business,    sigB.scores.business,    nameA, nameB),
    scalability:        win(sigA.scores.scalability,  sigB.scores.scalability,  nameA, nameB),
    investor_potential: win(sigA.scores.investor,    sigB.scores.investor,    nameA, nameB),
  };
}

/**
 * buildKeyDifferences(sigA, sigB, nameA, nameB)
 *
 * Derives up to 5 plain-English difference statements by comparing
 * stored signature fields. Only states differences that are genuine
 * (non-zero delta, non-unknown values, actually divergent).
 *
 * Sources: scores, industry, category, viability, risk_level,
 *          build_rec, monetisation, growth_traj, opportunity_rating.
 */
function buildKeyDifferences(sigA, sigB, nameA, nameB) {
  const diffs = [];

  // Score delta statements (threshold: >15 points)
  const SCORE_LABELS = {
    business:    'business score',
    technical:   'technical score',
    investor:    'investor score',
    scalability: 'scalability score',
    innovation:  'innovation score',
  };
  Object.entries(SCORE_LABELS).forEach(([k, label]) => {
    const a = sigA.scores[k] || 0;
    const b = sigB.scores[k] || 0;
    if (a === 0 && b === 0) return;
    const delta = Math.abs(a - b);
    if (delta > 15) {
      const higher = a > b ? nameA : nameB;
      const lower  = a > b ? nameB : nameA;
      diffs.push(higher + ' scores significantly higher on ' + label + ' (' + Math.max(a, b) + ' vs ' + Math.min(a, b) + ')');
    }
  });

  // Structural differences (only when both values are known and actually differ)
  const known = v => v && v !== 'unknown';

  if (known(sigA.industry) && known(sigB.industry) && sigA.industry !== sigB.industry)
    diffs.push('Different industries: ' + nameA + ' (' + sigA.industry + ') vs ' + nameB + ' (' + sigB.industry + ')');

  if (known(sigA.category) && known(sigB.category) && sigA.category !== sigB.category)
    diffs.push('Different categories: ' + nameA + ' is a ' + sigA.category + ', ' + nameB + ' is a ' + sigB.category);

  if (known(sigA.viability) && known(sigB.viability) && sigA.viability !== sigB.viability)
    diffs.push('Viability divergence: ' + nameA + ' rated "' + sigA.viability + '", ' + nameB + ' rated "' + sigB.viability + '"');

  if (known(sigA.risk_level) && known(sigB.risk_level) && sigA.risk_level !== sigB.risk_level)
    diffs.push('Risk profile differs: ' + nameA + ' is "' + sigA.risk_level + '" risk, ' + nameB + ' is "' + sigB.risk_level + '" risk');

  if (known(sigA.build_rec) && known(sigB.build_rec) && sigA.build_rec !== sigB.build_rec)
    diffs.push('Build recommendation diverges: ' + nameA + ' → "' + sigA.build_rec + '", ' + nameB + ' → "' + sigB.build_rec + '"');

  if (known(sigA.monetisation) && known(sigB.monetisation) && sigA.monetisation !== sigB.monetisation)
    diffs.push('Different monetisation models: ' + nameA + ' uses ' + sigA.monetisation + ', ' + nameB + ' uses ' + sigB.monetisation);

  if (known(sigA.growth_traj) && known(sigB.growth_traj) && sigA.growth_traj !== sigB.growth_traj)
    diffs.push('Growth trajectory differs: ' + nameA + ' is "' + sigA.growth_traj + '", ' + nameB + ' is "' + sigB.growth_traj + '"');

  return diffs.slice(0, 5);
}

/**
 * buildComparisonSummary(sigA, sigB, nameA, nameB, similarityScore, diffs)
 *
 * One plain-English sentence summarising the comparison of two projects.
 * Grounded in actual values only — no invented claims.
 */
function buildComparisonSummary(sigA, sigB, nameA, nameB, similarityScore, diffs) {
  const simLabel = similarityScore >= 70 ? 'highly similar' :
                   similarityScore >= 45 ? 'moderately similar' :
                   similarityScore >= 20 ? 'loosely related' : 'distinctly different';

  const meanA = Math.round(
    Object.values(sigA.scores).reduce((s, v) => s + v, 0) / Object.keys(sigA.scores).length
  );
  const meanB = Math.round(
    Object.values(sigB.scores).reduce((s, v) => s + v, 0) / Object.keys(sigB.scores).length
  );

  let summary = nameA + ' and ' + nameB + ' are ' + simLabel +
    ' (similarity: ' + similarityScore + '/100).';

  if (meanA > 0 && meanB > 0) {
    const stronger = meanA >= meanB ? nameA : nameB;
    const meanDelta = Math.abs(meanA - meanB);
    if (meanDelta > 5)
      summary += ' ' + stronger + ' holds a stronger overall intelligence score (' +
        Math.max(meanA, meanB) + ' vs ' + Math.min(meanA, meanB) + ' mean).';
    else
      summary += ' Both projects score comparably overall (' + meanA + ' vs ' + meanB + ' mean).';
  }

  if (diffs.length > 0)
    summary += ' Key differentiator: ' + diffs[0].toLowerCase() + '.';

  return summary;
}

/**
 * buildComparisonPair(projectA, projectB)
 *
 * Builds one comparison_pair object for two projects.
 * Reads only stored Phase 1-10 data. No AI calls. Deterministic.
 */
function buildComparisonPair(projectA, projectB) {
  const sigA  = enrichSignature(projectA);
  const sigB  = enrichSignature(projectB);
  const nameA = projectA.analysis?.project_name || projectA.url || 'Project A';
  const nameB = projectB.analysis?.project_name || projectB.url || 'Project B';

  // Similarity score: reuse existing computeSimilarity (0.0-1.0) → 0-100 integer
  const rawSim       = computeSimilarity(sigA, sigB);
  const similarity_score = Math.round(rawSim * 100);

  const winner_by_category = compareWinnerByCategory(sigA, sigB, nameA, nameB);
  const key_differences    = buildKeyDifferences(sigA, sigB, nameA, nameB);
  const comparison_summary = buildComparisonSummary(sigA, sigB, nameA, nameB, similarity_score, key_differences);

  return {
    project_a:          nameA,
    project_b:          nameB,
    comparison_summary,
    winner_by_category,
    key_differences,
    similarity_score,
  };
}

/**
 * buildComparisonEngine(allProjects)
 *
 * Entry point — generates all unique project pairs from the full portfolio.
 * Reads only stored project data. No AI calls. Deterministic.
 * Max 10 pairs to bound output size.
 *
 * Returns:
 *   { comparison_pairs: ComparisonPair[] }
 */
function buildComparisonEngine(allProjects) {
  // Only include projects with at least Phase 2 analysis
  const valid = allProjects.filter(p => p.analysis?.project_name);

  if (valid.length < 2) {
    return { ...COMPARISON_FALLBACK.comparison_engine };
  }

  const pairs = [];
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      if (pairs.length >= 10) break;  // cap at 10 pairs
      try {
        pairs.push(buildComparisonPair(valid[i], valid[j]));
      } catch (e) {
        console.warn('[AP3XVER5E] Pair comparison failed (skipped):', e.message);
      }
    }
    if (pairs.length >= 10) break;
  }

  // Sort by similarity_score descending — most similar pairs first
  pairs.sort((a, b) => b.similarity_score - a.similarity_score);

  return { comparison_pairs: pairs };
}


// ═══════════════════════════════════════════════════
// SECTION 5p — Builder Profile Intelligence Engine (Phase 12)
// ═══════════════════════════════════════════════════

// ── Stack classification token sets ──
const FRONTEND_TOKENS = new Set([
  'react','vue','angular','svelte','nextjs','nuxt','html','css','tailwind',
  'bootstrap','typescript','javascript','frontend','ui','ux','dom','browser',
  'vite','webpack','sass','scss','figma','webflow','framer',
]);
const BACKEND_TOKENS = new Set([
  'node','express','django','flask','fastapi','rails','laravel','spring','dotnet',
  'backend','api','rest','graphql','grpc','microservice','server','database',
  'postgres','mysql','mongodb','redis','supabase','firebase','prisma','orm',
  'python','java','go','rust','php','ruby','scala',
]);
const BP_AI_TOKENS = new Set([
  'ai','llm','gpt','ml','neural','embedding','nlp','openai','anthropic',
  'generative','vector','langchain','rag','transformer','stable','diffusion',
  'huggingface','mistral','claude','gemini','inference','fine-tuning',
]);

/**
 * classifyStackTokens(stackArr)
 * Scores a single project's inferred_stack against the three token sets.
 * Returns { frontend: 0|1, backend: 0|1, ai: 0|1 } presence flags.
 */
function classifyStackTokens(stackArr) {
  const tokens = new Set(
    stackArr.flatMap(s => String(s).toLowerCase().split(/[\s,\/\-\.]+/)).filter(Boolean)
  );
  return {
    frontend: [...tokens].some(t => FRONTEND_TOKENS.has(t)) ? 1 : 0,
    backend:  [...tokens].some(t => BACKEND_TOKENS.has(t))  ? 1 : 0,
    ai:       [...tokens].some(t => BP_AI_TOKENS.has(t))    ? 1 : 0,
  };
}

/**
 * buildSkillScores(sigs)
 * Assembles all 5 spec skill scores from stored Phase 2-3 data.
 *
 *   frontend:       % of projects with frontend stack signals × mean technical score
 *   backend:        % of projects with backend stack signals  × mean technical score
 *   ai_systems:     reused from computeSkillDominanceMap
 *   architecture:   reused from computeSkillDominanceMap
 *   product_design: proxy — mean of scalability + innovation scores, adjusted by
 *                   proportion of "scale" build recommendations
 *
 * All values clamped to 0-100 integers. Returns spec-exact skill_scores object.
 */
function buildSkillScores(sigs) {
  const n = sigs.length;
  if (n === 0) return { ...BUILDER_FALLBACK.builder_profile.skill_scores };

  const mean = arr => arr.length === 0 ? 0
    : Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);

  // Frontend / backend presence ratios
  let feCount = 0, beCount = 0;
  sigs.forEach(sig => {
    const flags = classifyStackTokens(sig._raw?.inferred_stack || []);
    if (flags.frontend) feCount++;
    if (flags.backend)  beCount++;
  });
  const feRatio = feCount / n;
  const beRatio = beCount / n;
  const meanTech = mean(sigs.map(s => s.scores?.technical || 0));

  // frontend: presence ratio × mean technical score (rounded, clamped)
  const frontend = Math.min(100, Math.round(feRatio * meanTech));

  // backend: presence ratio × mean technical score
  const backend  = Math.min(100, Math.round(beRatio  * meanTech));

  // ai_systems + architecture: reuse existing deterministic function
  const sdm = computeSkillDominanceMap(sigs);
  const ai_systems   = sdm.ai_systems;
  const architecture = sdm.architecture;

  // product_design: mean of scalability + innovation, boosted if "scale" rec is common
  const scaleCount = sigs.filter(s => s.build_rec === 'scale').length;
  const scaleBoost  = Math.round((scaleCount / n) * 10);
  const product_design = Math.min(100,
    Math.round(
      mean(sigs.map(s => s.scores?.scalability || 0)) * 0.5 +
      mean(sigs.map(s => s.scores?.innovation  || 0)) * 0.5
    ) + scaleBoost
  );

  return { frontend, backend, ai_systems, architecture, product_design };
}

/**
 * extractDominantSkills(skillScores, sigs)
 * Returns up to 5 skill names where score >= 55, sorted desc.
 * Only names skills with genuine evidence — no score padding.
 */
function extractDominantSkills(skillScores, sigs) {
  const LABELS = {
    ai_systems:     'AI Systems',
    backend:        'Backend Engineering',
    architecture:   'Systems Architecture',
    frontend:       'Frontend Development',
    product_design: 'Product Design',
  };
  return Object.entries(skillScores)
    .filter(([, v]) => v >= 55)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([k]) => LABELS[k] || k);
}

/**
 * inferTechnicalIdentity(sigs, skillScores)
 * One phrase identifying the builder's primary technical mode.
 * Derived purely from score ordering and stack token presence.
 * No invented traits — only what the data supports.
 */
function inferTechnicalIdentity(sigs, skillScores) {
  const { frontend, backend, ai_systems, architecture } = skillScores;
  const top = Math.max(frontend, backend, ai_systems, architecture);

  if (top === 0) return 'Insufficient technical signal across portfolio';

  const isFullStack = frontend >= 45 && backend >= 45;
  if (isFullStack && ai_systems >= 55)
    return 'AI-native full-stack builder — integrates AI capabilities across frontend and backend systems';
  if (isFullStack)
    return 'Full-stack engineer — builds across both frontend presentation and backend logic layers';
  if (ai_systems >= 65 && ai_systems === top)
    return 'AI systems specialist — portfolio is primarily centred on AI/ML-driven products and tools';
  if (architecture >= 65 && architecture === top)
    return 'Systems architect — emphasis on scalable, composable system design across projects';
  if (backend >= 65 && backend === top)
    return 'Backend engineer — primary focus on server-side systems, APIs, and data architecture';
  if (frontend >= 65 && frontend === top)
    return 'Frontend developer — primary focus on browser-based interfaces and user-facing products';

  // Mixed/emerging profile
  const dominant = Object.entries(skillScores).sort(([,a],[,b]) => b - a)[0];
  return 'Generalist builder with emerging strength in ' + (dominant[0].replace(/_/g, ' '));
}

/**
 * inferSystemBuildingStyle(sigs)
 * One phrase describing HOW the builder constructs systems.
 * Derived from: complexity_rating distribution, architecture_type frequency,
 * build_rec ratios, and mean scalability score.
 * Objective and evidence-based only.
 */
function inferSystemBuildingStyle(sigs) {
  const n = sigs.length;
  if (n === 0) return 'Insufficient portfolio data to determine building style';

  const complexCounts = { high: 0, medium: 0, low: 0 };
  const archTypes = new Map();
  sigs.forEach(sig => {
    const cr = (sig._raw?.complexity_rating?.[0] || '').toLowerCase();
    if (cr.includes('high'))   complexCounts.high++;
    else if (cr.includes('low')) complexCounts.low++;
    else if (cr.includes('med')) complexCounts.medium++;

    const at = (sig._raw?.architecture_type?.[0] || '').toLowerCase();
    if (at && at !== 'unknown') archTypes.set(at, (archTypes.get(at) || 0) + 1);
  });

  const scaleCount  = sigs.filter(s => s.build_rec === 'scale').length;
  const improveCount= sigs.filter(s => s.build_rec === 'improve').length;
  const meanScal    = Math.round(sigs.reduce((s, p) => s + (p.scores?.scalability || 0), 0) / n);

  const dominantArch = [...archTypes.entries()].sort(([,a],[,b]) => b - a)[0]?.[0] || null;
  const highRatio    = complexCounts.high / n;
  const scaleRatio   = scaleCount / n;

  if (highRatio >= 0.5 && meanScal >= 60)
    return 'High-complexity systems builder — consistently produces architecturally sophisticated, scalable solutions'
      + (dominantArch ? ' with a preference for ' + dominantArch + ' patterns' : '');
  if (scaleRatio >= 0.4)
    return 'Scale-oriented builder — portfolio leans toward products designed for growth and expansion'
      + (dominantArch ? ', often using ' + dominantArch + ' architecture' : '');
  if (improveCount >= Math.ceil(n * 0.4))
    return 'Iterative builder — favours incremental improvement and refinement over big-bang launches'
      + (dominantArch ? ', typically within ' + dominantArch + ' structures' : '');
  if (complexCounts.low >= Math.ceil(n * 0.5))
    return 'Pragmatic builder — prioritises working solutions over architectural complexity'
      + (dominantArch ? ', often choosing ' + dominantArch + ' for speed' : '');

  return 'Balanced builder — mixes complexity levels and architectural approaches across projects'
    + (dominantArch ? ', with a recurring use of ' + dominantArch + ' patterns' : '');
}

/**
 * extractStrongestDomains(sigs)
 * Returns up to 3 domains (industry + category combos) the builder
 * has built in most, weighted by project count and mean score.
 * Only names domains with evidence (>=1 project, known values).
 */
function extractStrongestDomains(sigs) {
  const domainMap = new Map();
  sigs.forEach(sig => {
    const ind = sig.industry !== 'unknown' ? sig.industry : null;
    const cat = sig.category !== 'unknown' ? sig.category : null;
    if (!ind && !cat) return;
    const key = ind && cat ? ind + ' / ' + cat : (ind || cat);
    if (!domainMap.has(key)) domainMap.set(key, { count: 0, scoreSum: 0 });
    const entry = domainMap.get(key);
    entry.count++;
    entry.scoreSum += (sig.scores?.business || 0) + (sig.scores?.technical || 0);
  });

  return [...domainMap.entries()]
    .map(([domain, { count, scoreSum }]) => ({
      domain,
      weight: count * 10 + Math.round(scoreSum / (count * 2)),
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map(({ domain }) => domain);
}

/**
 * extractInnovationPattern(sigs)
 * Identifies recurring innovation signals across the portfolio.
 * Sources: innovation_score percentile, novel stack tokens,
 * growth_traj patterns, opportunity_rating patterns.
 * Returns up to 4 plain-English strings. No invented claims.
 */
function extractInnovationPattern(sigs) {
  const patterns = [];
  const n = sigs.length;
  if (n === 0) return patterns;

  const mean = arr => arr.length === 0 ? 0
    : Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);

  const meanInnovation = mean(sigs.map(s => s.scores?.innovation || 0));
  if (meanInnovation >= 65)
    patterns.push('Consistently high innovation scores (' + meanInnovation + '/100 mean) — portfolio skews toward novel solutions');
  else if (meanInnovation >= 45 && meanInnovation < 65)
    patterns.push('Moderate innovation baseline (' + meanInnovation + '/100 mean) — mixes established and emerging approaches');
  else if (meanInnovation > 0)
    patterns.push('Innovation scores below average (' + meanInnovation + '/100 mean) — portfolio favours proven patterns');

  // AI stack signal frequency
  const aiCount = sigs.filter(sig =>
    classifyStackTokens(sig._raw?.inferred_stack || []).ai === 1
  ).length;
  if (aiCount > 0)
    patterns.push(aiCount + ' of ' + n + ' project' + (n > 1 ? 's' : '') +
      ' incorporate AI/ML stack signals — recurring use of AI as a core building block');

  // Growth trajectory frequency
  const trajCounts = new Map();
  sigs.forEach(s => {
    const t = s.growth_traj;
    if (t && t !== 'unknown') trajCounts.set(t, (trajCounts.get(t) || 0) + 1);
  });
  const topTraj = [...trajCounts.entries()].sort(([,a],[,b]) => b - a)[0];
  if (topTraj && topTraj[1] >= 2)
    patterns.push('Dominant growth trajectory: "' + topTraj[0] + '" (seen in ' + topTraj[1] + ' projects)');

  // Opportunity rating frequency
  const oppCounts = new Map();
  sigs.forEach(s => {
    const o = s.opportunity_rating;
    if (o && o !== 'unknown') oppCounts.set(o, (oppCounts.get(o) || 0) + 1);
  });
  const topOpp = [...oppCounts.entries()].sort(([,a],[,b]) => b - a)[0];
  if (topOpp && topOpp[1] >= 2)
    patterns.push('Most common opportunity rating: "' + topOpp[0] + '" across ' + topOpp[1] + ' projects');

  return patterns.slice(0, 4);
}

/**
 * extractArchitecturePreferences(sigs)
 * Surfaces the builder's recurring architectural choices.
 * Sources: architecture_type frequency, complexity_rating distribution,
 * scalability_score mean. Returns up to 4 strings.
 */
function extractArchitecturePreferences(sigs) {
  const prefs = [];
  const n = sigs.length;
  if (n === 0) return prefs;

  // Most frequent architecture types (non-unknown, non-empty)
  const archMap = new Map();
  sigs.forEach(sig => {
    const at = (sig._raw?.architecture_type?.[0] || '').toLowerCase().trim();
    if (at && at !== 'unknown' && !isSentinel(at))
      archMap.set(at, (archMap.get(at) || 0) + 1);
  });
  const topArch = [...archMap.entries()].sort(([,a],[,b]) => b - a).slice(0, 2);
  topArch.forEach(([arch, count]) => {
    if (count >= 1)
      prefs.push(arch.charAt(0).toUpperCase() + arch.slice(1) + ' architecture'
        + (count > 1 ? ' (recurring — seen in ' + count + ' projects)' : ' (observed)'));
  });

  // Complexity preference
  let high = 0, med = 0, low = 0;
  sigs.forEach(sig => {
    const cr = (sig._raw?.complexity_rating?.[0] || '').toLowerCase();
    if (cr.includes('high')) high++;
    else if (cr.includes('low')) low++;
    else if (cr.includes('med')) med++;
  });
  const complexTotal = high + med + low;
  if (complexTotal > 0) {
    const dominant = high >= med && high >= low ? 'high-complexity'
      : low >= med && low >= high ? 'low-complexity' : 'medium-complexity';
    prefs.push('Preference for ' + dominant + ' systems (' +
      Math.round((Math.max(high, med, low) / complexTotal) * 100) + '% of classified projects)');
  }

  // Scalability orientation
  const meanScal = Math.round(sigs.reduce((s, p) => s + (p.scores?.scalability || 0), 0) / n);
  if (meanScal >= 65)
    prefs.push('Strong scalability orientation — mean scalability score ' + meanScal + '/100 across portfolio');
  else if (meanScal > 0 && meanScal < 45)
    prefs.push('Low scalability scores suggest early-stage or prototype-focused builds (mean: ' + meanScal + '/100)');

  return prefs.slice(0, 4);
}

/**
 * extractRecurringPatterns(sigs)
 * Reuses findRepeatedPatterns (already in codebase) and filters to
 * structural signals only — industry, category, build approach, tech stack.
 * Returns up to 5 strings. No score noise.
 */
function extractRecurringPatterns(sigs) {
  if (sigs.length < 2) return [];
  // findRepeatedPatterns already returns human-readable "token (found across N projects)"
  const raw = findRepeatedPatterns(sigs);
  // Filter out pure numeric artifacts (keep strings with letters)
  return raw.filter(p => /[a-zA-Z]{3,}/.test(p)).slice(0, 5);
}

/**
 * buildOverallBuilderSummary(profile)
 * Synthesises the computed builder_profile fields into one plain-English
 * paragraph. Reads only from the profile object — no additional inference.
 * No invented claims. Objective and evidence-based.
 */
function buildOverallBuilderSummary(profile) {
  const parts = [];

  if (profile.technical_identity)
    parts.push(profile.technical_identity + '.');

  if (profile.dominant_skills.length > 0)
    parts.push('Dominant skills: ' + profile.dominant_skills.join(', ') + '.');

  if (profile.strongest_domains.length > 0)
    parts.push('Strongest domains: ' + profile.strongest_domains.join(', ') + '.');

  if (profile.system_building_style)
    parts.push(profile.system_building_style + '.');

  if (profile.innovation_pattern.length > 0)
    parts.push(profile.innovation_pattern[0] + '.');

  if (profile.architecture_preferences.length > 0)
    parts.push(profile.architecture_preferences[0] + '.');

  if (parts.length === 0)
    return 'Insufficient portfolio data to generate a builder summary.';

  return parts.join(' ');
}

/**
 * buildBuilderProfile(allProjects)
 * Entry point — generates the spec-exact builder_profile object
 * from all stored projects. Reads only project.analysis + Phase 3 data.
 * No AI calls. No external data. Deterministic.
 * Stored on every project twin so the profile is always current.
 *
 * Returns spec-exact builder_profile: {
 *   dominant_skills, technical_identity, system_building_style,
 *   strongest_domains, innovation_pattern, architecture_preferences,
 *   recurring_patterns, skill_scores, overall_builder_summary
 * }
 */
function buildBuilderProfile(allProjects) {
  const valid = allProjects.filter(p => p.analysis?.project_name);

  if (valid.length === 0) {
    return { ...BUILDER_FALLBACK.builder_profile };
  }

  // Build enriched signatures for all projects (reuse existing function)
  const sigs = valid.map(p => {
    const sig = enrichSignature(p);
    sig._name = p.analysis?.project_name || p.url || 'Unknown';
    return sig;
  });

  // ── Compute all profile fields ──
  const skill_scores              = buildSkillScores(sigs);
  const dominant_skills           = extractDominantSkills(skill_scores, sigs);
  const technical_identity        = inferTechnicalIdentity(sigs, skill_scores);
  const system_building_style     = inferSystemBuildingStyle(sigs);
  const strongest_domains         = extractStrongestDomains(sigs);
  const innovation_pattern        = extractInnovationPattern(sigs);
  const architecture_preferences  = extractArchitecturePreferences(sigs);
  const recurring_patterns        = extractRecurringPatterns(sigs);

  // Build partial profile first so summary can read it
  const partialProfile = {
    dominant_skills,
    technical_identity,
    system_building_style,
    strongest_domains,
    innovation_pattern,
    architecture_preferences,
    recurring_patterns,
    skill_scores,
  };

  const overall_builder_summary = buildOverallBuilderSummary(partialProfile);

  return {
    dominant_skills,
    technical_identity,
    system_building_style,
    strongest_domains,
    innovation_pattern,
    architecture_preferences,
    recurring_patterns,
    skill_scores,
    overall_builder_summary,
  };
}


// ═══════════════════════════════════════════════════
// SECTION 5q — System Evolution Tracking Layer (Phase 13)
// ═══════════════════════════════════════════════════

/**
 * computeComplexityLevel(analysis)
 * Derives a complexity_level string from stored Phase 3 + Phase 2 data.
 * Sources: mai.technical.complexity_rating (agent), mean scores.
 * Returns: 'low' | 'medium' | 'high' | 'unknown'
 * Never invents — falls back to 'unknown' when data is insufficient.
 */
function computeComplexityLevel(analysis) {
  const mai = analysis.multi_agent_intelligence || {};
  const cr  = (mai.technical?.complexity_rating || '').toLowerCase();
  if (cr.includes('high'))   return 'high';
  if (cr.includes('low'))    return 'low';
  if (cr.includes('med'))    return 'medium';

  // Fallback: infer from mean score band
  const scores = [
    parseInt(analysis.technical_score,   10) || 0,
    parseInt(analysis.scalability_score, 10) || 0,
    parseInt(analysis.innovation_score,  10) || 0,
  ].filter(s => s > 0);
  if (scores.length === 0) return 'unknown';
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (mean >= 70) return 'high';
  if (mean >= 45) return 'medium';
  return 'low';
}

/**
 * computeIntelligenceDepth(analysis)
 * Counts how many intelligence phases are populated in this project.
 * Uses the same boolean checks as intelligence_layer_index.
 * Returns: integer 0-13
 */
function computeIntelligenceDepth(analysis) {
  const checks = [
    !!(analysis.project_name),
    !!(analysis.report_overview),
    !!(parseInt(analysis.business_score, 10) > 0),
    !!(analysis.multi_agent_intelligence),
    !!(analysis.intelligence_fusion),
    !!(analysis.decision_engine),
    !!(analysis.knowledge_graph?.nodes?.length),
    !!(analysis.semantic_memory?.strategic_role),
    !!(analysis.cross_project_reasoning?.portfolio_summary),
    !!(analysis.portfolio_intelligence_report?.overview),
    !!(analysis.portfolio_visual_map?.nodes?.length),
    !!(analysis.reasoning_trace?.final_reasoning_summary),
    !!(analysis.confidence_model?.reliability_summary),
  ];
  return checks.filter(Boolean).length;
}

/**
 * computeFeatureMaturity(analysis)
 * Derives feature maturity stage from stored decision engine + Phase 2 signals.
 * Sources: build_recommendation, viability, confidence_score, mean scores.
 * Returns: 'prototype' | 'mvp' | 'mature' | 'scalable' | 'unknown'
 */
function computeFeatureMaturity(analysis) {
  const dec    = analysis.decision_engine || {};
  const buildR = (dec.build_recommendation || '').toLowerCase();
  const viab   = (dec.viability            || '').toLowerCase();
  const conf   = parseInt(dec.confidence_score, 10) || 0;
  const meanScore = Math.round(
    [analysis.business_score, analysis.technical_score, analysis.investor_score,
     analysis.scalability_score, analysis.innovation_score]
      .map(s => parseInt(s, 10) || 0)
      .reduce((a, b) => a + b, 0) / 5
  );

  if (buildR === 'scale' && viab === 'high')   return 'scalable';
  if (buildR === 'scale')                       return 'mature';
  if (buildR === 'improve' && conf >= 50)       return 'mvp';
  if (buildR === 'improve')                     return 'prototype';
  if (buildR === 'pivot')                       return 'prototype';
  if (buildR === 'avoid')                       return 'prototype';

  // Fallback from scores when decision engine has no data
  if (meanScore >= 70) return 'mature';
  if (meanScore >= 45) return 'mvp';
  if (meanScore >  0)  return 'prototype';
  return 'unknown';
}

/**
 * buildProgressionNote(project, idx, allSorted)
 * Generates one plain-English note for a project's progression entry.
 * Compares to earlier projects to identify what changed or what was new.
 * Strictly data-driven — no invented traits.
 */
function buildProgressionNote(project, idx, allSorted) {
  const a    = project.analysis || {};
  const name = a.project_name || project.url || 'Unknown project';
  const parts = [];

  if (idx === 0) {
    parts.push('First project in portfolio');
  } else {
    // New industry/category vs previous projects
    const prevIndustries = new Set(
      allSorted.slice(0, idx).map(p =>
        (p.analysis?.multi_agent_intelligence?.research?.industry || '').toLowerCase()
      ).filter(Boolean)
    );
    const thisIndustry = (a.multi_agent_intelligence?.research?.industry || '').toLowerCase();
    if (thisIndustry && thisIndustry !== 'unknown' && !prevIndustries.has(thisIndustry))
      parts.push('New industry domain: ' + thisIndustry);

    // Intelligence depth vs previous max
    const prevMaxDepth = Math.max(...allSorted.slice(0, idx).map(p => computeIntelligenceDepth(p.analysis || {})));
    const thisDepth    = computeIntelligenceDepth(a);
    if (thisDepth > prevMaxDepth)
      parts.push('Deepest intelligence capture to date (' + thisDepth + '/13 phases)');

    // Highest scorer to date
    const thisMean = Math.round(
      [a.business_score, a.technical_score, a.investor_score, a.scalability_score, a.innovation_score]
        .map(s => parseInt(s, 10) || 0).reduce((x, y) => x + y, 0) / 5
    );
    const prevMeans = allSorted.slice(0, idx).map(p => Math.round(
      [p.analysis?.business_score, p.analysis?.technical_score, p.analysis?.investor_score,
       p.analysis?.scalability_score, p.analysis?.innovation_score]
        .map(s => parseInt(s, 10) || 0).reduce((x, y) => x + y, 0) / 5
    ));
    const prevMax = Math.max(...prevMeans, 0);
    if (thisMean > prevMax && thisMean > 0)
      parts.push('Highest mean intelligence score to date (' + thisMean + '/100)');
  }

  // Build recommendation note
  const dec    = a.decision_engine || {};
  const buildR = (dec.build_recommendation || '').toLowerCase();
  if (buildR && buildR !== 'unknown')
    parts.push('Decision: ' + buildR);

  if (parts.length === 0) parts.push('Project analysed');
  return parts.join(' · ');
}

/**
 * buildProjectProgression(allSorted)
 * Maps each project to a spec-exact progression entry.
 * Projects must be sorted chronologically (oldest first) before calling.
 * Returns: ProjectProgression[]
 */
function buildProjectProgression(allSorted) {
  return allSorted.map((project, idx) => {
    const a = project.analysis || {};
    return {
      timestamp:         project.created_at || '',
      complexity_level:  computeComplexityLevel(a),
      intelligence_depth:computeIntelligenceDepth(a),
      feature_maturity:  computeFeatureMaturity(a),
      notes:             buildProgressionNote(project, idx, allSorted),
    };
  });
}

/**
 * buildPortfolioEvolutionSummary(progressions, allSorted)
 * One paragraph describing the portfolio's evolution over time.
 * Covers: project count, time span, complexity trajectory, domain expansion.
 * Purely data-driven from stored timestamps and progression data.
 */
function buildPortfolioEvolutionSummary(progressions, allSorted) {
  const n = progressions.length;
  if (n === 0) return 'No projects in portfolio yet.';
  if (n === 1) return 'Portfolio contains one project: ' +
    (allSorted[0].analysis?.project_name || allSorted[0].url || 'Unknown') + '.';

  // Time span
  const first    = new Date(allSorted[0].created_at || Date.now());
  const last     = new Date(allSorted[n - 1].created_at || Date.now());
  const daysDiff = Math.max(0, Math.round((last - first) / 86400000));
  const spanLabel = daysDiff === 0 ? 'same session' :
    daysDiff < 7 ? daysDiff + ' days' :
    daysDiff < 30 ? Math.round(daysDiff / 7) + ' weeks' :
    Math.round(daysDiff / 30) + ' months';

  // Complexity trajectory
  const CLVL = { unknown: 0, low: 1, medium: 2, high: 3 };
  const firstHalf  = progressions.slice(0, Math.ceil(n / 2)).map(p => CLVL[p.complexity_level] || 0);
  const secondHalf = progressions.slice(Math.ceil(n / 2)).map(p => CLVL[p.complexity_level] || 0);
  const mean = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const complexTrend = mean(secondHalf) > mean(firstHalf) + 0.3 ? 'increasing' :
    mean(firstHalf) > mean(secondHalf) + 0.3 ? 'decreasing' : 'consistent';

  // Domain expansion
  const industries = new Set(
    allSorted.map(p =>
      (p.analysis?.multi_agent_intelligence?.research?.industry || '').toLowerCase()
    ).filter(i => i && i !== 'unknown')
  );

  // Intelligence depth trend
  const avgDepth = Math.round(progressions.reduce((s, p) => s + p.intelligence_depth, 0) / n);
  const maxDepth = Math.max(...progressions.map(p => p.intelligence_depth));

  return (
    'Portfolio spans ' + n + ' project' + (n > 1 ? 's' : '') + ' over ' + spanLabel + '. ' +
    'Complexity has been ' + complexTrend + ' across the timeline. ' +
    (industries.size > 0 ? industries.size + ' distinct industry domain' + (industries.size > 1 ? 's' : '') + ' covered. ' : '') +
    'Average intelligence depth: ' + avgDepth + '/13 phases populated; ' +
    'peak depth: ' + maxDepth + '/13.'
  );
}

/**
 * buildSkillGrowthTrend(allSorted)
 * Detects whether the builder's mean intelligence scores are trending
 * up, flat, or down using simple linear regression over chronological order.
 * Returns one plain-English trend description.
 * Requires at least 2 projects to detect a trend.
 */
function buildSkillGrowthTrend(allSorted) {
  const n = allSorted.length;
  if (n === 0) return 'No projects to assess trend.';
  if (n === 1) return 'Single project — trend requires at least two data points.';

  // Mean score per project (chronological)
  const means = allSorted.map(p => {
    const a = p.analysis || {};
    const scores = [a.business_score, a.technical_score, a.investor_score,
                    a.scalability_score, a.innovation_score]
      .map(s => parseInt(s, 10) || 0);
    const valid = scores.filter(s => s > 0);
    return valid.length ? Math.round(valid.reduce((x, y) => x + y, 0) / valid.length) : 0;
  });

  // Simple linear regression: y = mean score, x = project index
  const xMean = (n - 1) / 2;
  const yMean = means.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  means.forEach((y, x) => { num += (x - xMean) * (y - yMean); den += (x - xMean) ** 2; });
  const slope = den === 0 ? 0 : num / den;  // points per project

  const first3Mean = Math.round(means.slice(0, Math.min(3, n)).reduce((a, b) => a + b, 0) / Math.min(3, n));
  const last3Mean  = Math.round(means.slice(-Math.min(3, n)).reduce((a, b) => a + b, 0) / Math.min(3, n));

  if (slope > 2)
    return 'Strong upward trend — mean intelligence scores are rising across projects ' +
      '(first ' + Math.min(3, n) + ': ~' + first3Mean + '/100 → last ' + Math.min(3, n) + ': ~' + last3Mean + '/100)';
  if (slope > 0.5)
    return 'Moderate upward trend — scores improving gradually ' +
      '(' + first3Mean + ' → ' + last3Mean + ' mean)';
  if (slope < -2)
    return 'Downward trend — mean scores declining across recent projects ' +
      '(' + first3Mean + ' → ' + last3Mean + ' mean); may reflect newer, more complex domains';
  if (slope < -0.5)
    return 'Slight downward trend — minor score decline across portfolio ' +
      '(' + first3Mean + ' → ' + last3Mean + ' mean)';
  return 'Stable trend — mean intelligence scores consistent across portfolio (~' + Math.round(yMean) + '/100 average)';
}

/**
 * computeSystemMaturityScore(allSorted, progressions)
 * 0-100 integer representing the overall maturity of the system as a whole.
 * Weighted composite:
 *   - Portfolio size (25%): more projects = more mature
 *   - Mean intelligence score (30%): raw capability
 *   - Mean intelligence depth (25%): phase coverage
 *   - Complexity trend (20%): are projects getting harder/better?
 * No invented metrics — all derived from stored data.
 */
function computeSystemMaturityScore(allSorted, progressions) {
  const n = allSorted.length;
  if (n === 0) return 0;

  // Portfolio size component (25%) — cap benefit at 10 projects
  const sizeScore = Math.min(100, Math.round((n / 10) * 100));

  // Mean intelligence score across portfolio (30%)
  const allMeans = allSorted.map(p => {
    const a = p.analysis || {};
    const scores = [a.business_score, a.technical_score, a.investor_score,
                    a.scalability_score, a.innovation_score]
      .map(s => parseInt(s, 10) || 0).filter(s => s > 0);
    return scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : 0;
  });
  const meanScore = allMeans.length ? Math.round(allMeans.reduce((a, b) => a + b, 0) / allMeans.length) : 0;

  // Mean intelligence depth (25%) — scaled to 13 phases
  const meanDepth = progressions.length
    ? progressions.reduce((s, p) => s + p.intelligence_depth, 0) / progressions.length
    : 0;
  const depthScore = Math.min(100, Math.round((meanDepth / 13) * 100));

  // Complexity trend (20%): fraction of projects at "high" or "medium" complexity
  const complexCount = progressions.filter(p =>
    p.complexity_level === 'high' || p.complexity_level === 'medium').length;
  const complexScore = progressions.length
    ? Math.round((complexCount / progressions.length) * 100) : 0;

  return Math.min(100, Math.round(
    sizeScore   * 0.25 +
    meanScore   * 0.30 +
    depthScore  * 0.25 +
    complexScore * 0.20
  ));
}

/**
 * buildEvolutionTracker(allProjects)
 * Entry point — generates the spec-exact evolution_tracker object
 * from all stored projects sorted chronologically.
 * Reads only project.analysis + project.created_at.
 * No AI calls. No external data. Deterministic.
 * Stored on every project twin so the tracker is always current.
 *
 * Returns spec-exact evolution_tracker: {
 *   project_progression, portfolio_evolution_summary,
 *   skill_growth_trend, system_maturity_score
 * }
 */
function buildEvolutionTracker(allProjects) {
  // Filter to projects with at least Phase 1 data and a timestamp
  const valid = allProjects.filter(p => p.analysis?.project_name && p.created_at);

  if (valid.length === 0) {
    return { ...EVOLUTION_FALLBACK.evolution_tracker };
  }

  // Sort chronologically — oldest first (ISO strings sort lexicographically correctly)
  const allSorted = [...valid].sort((a, b) =>
    (a.created_at || '').localeCompare(b.created_at || '')
  );

  const project_progression         = buildProjectProgression(allSorted);
  const portfolio_evolution_summary  = buildPortfolioEvolutionSummary(project_progression, allSorted);
  const skill_growth_trend           = buildSkillGrowthTrend(allSorted);
  const system_maturity_score        = computeSystemMaturityScore(allSorted, project_progression);

  return {
    project_progression,
    portfolio_evolution_summary,
    skill_growth_trend,
    system_maturity_score,
  };
}


// ═══════════════════════════════════════════════════
// SECTION 5r — What-If Simulation Engine (Phase 14)
// ═══════════════════════════════════════════════════
//
// All scenario labels are prefixed [HYPOTHETICAL].
// All reasoning is inferred ONLY from stored project intelligence.
// No external data. No real-world assumptions.

/**
 * wiSentinelArr(arr)
 * Returns true if an array contains only sentinel/fallback values.
 * Used to suppress risk/opportunity factors that carry no signal.
 */
function wiSentinelArr(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return true;
  return arr.every(v => isSentinel(v));
}

/**
 * wiCleanArr(arr, maxItems)
 * Filters and deduplicates a stored array, removing sentinels and blanks.
 * Returns up to maxItems clean strings.
 */
function wiCleanArr(arr, maxItems) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(s => String(s).trim())
    .filter(s => s.length > 4 && !isSentinel(s))
    .slice(0, maxItems);
}

/**
 * wiScore(components)
 * Computes a weighted average from { value, weight } pairs.
 * Skips components where value === 0 (no data) — does not penalise missing scores.
 * Clamps result to 0–100 integer.
 */
function wiScore(components) {
  let weightedSum = 0, totalWeight = 0;
  components.forEach(({ value, weight }) => {
    if (value > 0) { weightedSum += value * weight; totalWeight += weight; }
  });
  return totalWeight === 0 ? 0 : Math.min(100, Math.round(weightedSum / totalWeight));
}

/**
 * buildScaleScenario(a, mai, fus, dec, sig)
 *
 * [HYPOTHETICAL] What if this project is scaled aggressively?
 *
 * Feasibility: scalability_score (40%) + investor_score (30%) + business_score (30%)
 * Outcome:     conditioned on growth_trajectory + viability + build_rec
 * Risks:       from mai.risk.key_risks + fus.biggest_risks
 * Opportunities: from mai.growth.scaling_opportunities + fus.strongest_opportunities
 */
function buildScaleScenario(a, mai, fus, dec, sig) {
  const scalScore = parseInt(a.scalability_score, 10) || 0;
  const invScore  = parseInt(a.investor_score,    10) || 0;
  const bizScore  = parseInt(a.business_score,    10) || 0;
  const feasibility_score = wiScore([
    { value: scalScore, weight: 40 },
    { value: invScore,  weight: 30 },
    { value: bizScore,  weight: 30 },
  ]);

  const viab     = (dec.viability || '').toLowerCase();
  const buildRec = (dec.build_recommendation || '').toLowerCase();
  const growTraj = (mai.growth?.growth_trajectory || '').toLowerCase();
  const projName = a.project_name || 'This project';

  let outcome_prediction;
  if (feasibility_score >= 70 && (viab === 'high' || buildRec === 'scale'))
    outcome_prediction = projName + ' shows strong scale potential — aggressive growth is likely to compound existing advantages and widen market position given its high scalability and investor scores.';
  else if (feasibility_score >= 45)
    outcome_prediction = projName + ' could scale with targeted investment, but will likely require structural improvements to sustain growth at speed — moderate scalability signals suggest friction at scale.';
  else if (growTraj && growTraj !== 'unknown')
    outcome_prediction = 'Scaling ' + projName + ' under current conditions carries significant execution risk — stored signals indicate ' + growTraj + ' trajectory, which limits the safe pace of expansion.';
  else
    outcome_prediction = 'Insufficient stored signals to confidently predict scale outcomes — proceed with detailed feasibility analysis before committing resources.';

  const risk_factors        = wiCleanArr([
    ...(mai.risk?.key_risks || []),
    ...(fus.biggest_risks   || []),
  ], 3);
  const opportunity_factors = wiCleanArr([
    ...(mai.growth?.scaling_opportunities  || []),
    ...(fus.strongest_opportunities        || []),
  ], 3);

  return {
    scenario:           '[HYPOTHETICAL] Aggressive scale — what if this project is scaled rapidly across its core market?',
    outcome_prediction,
    risk_factors:       risk_factors.length       ? risk_factors       : ['Insufficient risk data in stored intelligence'],
    opportunity_factors:opportunity_factors.length ? opportunity_factors : ['Insufficient opportunity data in stored intelligence'],
    feasibility_score,
  };
}

/**
 * buildAIIntegrationScenario(a, mai, fus, dec, sig)
 *
 * [HYPOTHETICAL] What if AI capabilities are integrated or deepened?
 *
 * Feasibility: innovation_score (40%) + technical_score (35%) + AI stack presence bonus (25%)
 * Outcome:     conditioned on current AI stack signals + innovation_score band
 */
function buildAIIntegrationScenario(a, mai, fus, dec, sig) {
  const innScore  = parseInt(a.innovation_score,  10) || 0;
  const techScore = parseInt(a.technical_score,   10) || 0;

  // AI stack presence: check inferred_stack for AI tokens
  const BP_AI_CHECK = new Set(['ai','llm','gpt','ml','neural','embedding','nlp','openai','anthropic','generative','langchain','rag','transformer']);
  const stackTokens = (mai.technical?.inferred_stack || [])
    .flatMap(s => String(s).toLowerCase().split(/[\s,\/\-\.]+/));
  const hasAI = stackTokens.some(t => BP_AI_CHECK.has(t));
  const aiBonus = hasAI ? 80 : 30;  // already AI-native vs greenfield integration

  const feasibility_score = wiScore([
    { value: innScore,  weight: 40 },
    { value: techScore, weight: 35 },
    { value: aiBonus,   weight: 25 },
  ]);

  const projName = a.project_name || 'This project';
  let outcome_prediction;
  if (hasAI && innScore >= 65)
    outcome_prediction = projName + ' already demonstrates AI-native signals — deepening AI integration would likely accelerate its differentiation advantage and open new automation and intelligence-layer capabilities.';
  else if (hasAI)
    outcome_prediction = projName + ' has AI stack signals but moderate innovation scores — expanding AI integration could improve outcomes if paired with clearer product direction.';
  else if (innScore >= 60)
    outcome_prediction = 'Adding AI capabilities to ' + projName + ' is technically feasible given strong innovation scores — the primary risk is integration complexity without existing AI infrastructure.';
  else
    outcome_prediction = 'AI integration into ' + projName + ' would require foundational technical investment — current signals suggest limited AI readiness.';

  const risk_factors = wiCleanArr([
    ...(mai.technical?.inferred_stack?.length ? ['Integration complexity with existing stack: ' + (mai.technical.inferred_stack.slice(0,2).join(', ') || 'unknown')] : []),
    ...(mai.risk?.operational_concerns || []),
  ], 3);
  const opportunity_factors = wiCleanArr([
    ...(mai.growth?.expansion_ideas           || []),
    ...(fus.strongest_opportunities           || []),
    ...(mai.investor?.investment_signals      || []),
  ], 3);

  return {
    scenario:           '[HYPOTHETICAL] AI integration — what if AI capabilities are embedded or significantly deepened?',
    outcome_prediction,
    risk_factors:       risk_factors.length       ? risk_factors       : ['Insufficient risk data in stored intelligence'],
    opportunity_factors:opportunity_factors.length ? opportunity_factors : ['Insufficient opportunity data in stored intelligence'],
    feasibility_score,
  };
}

/**
 * buildPivotScenario(a, mai, fus, dec, sig)
 *
 * [HYPOTHETICAL] What if the business model is changed or the project pivots?
 *
 * Feasibility: business_score (35%) + investor_score (30%) + confidence inverse (35%)
 *   High confidence in current direction = harder to pivot → lower feasibility
 * Outcome:     conditioned on current monetisation model + viability + opportunity_rating
 */
function buildPivotScenario(a, mai, fus, dec, sig) {
  const bizScore  = parseInt(a.business_score,    10) || 0;
  const invScore  = parseInt(a.investor_score,    10) || 0;
  const confidence= parseInt(dec.confidence_score,10) || 50;
  // Pivot is more feasible when current direction has low confidence
  const pivotReadiness = Math.max(0, 100 - confidence);

  const feasibility_score = wiScore([
    { value: bizScore,       weight: 35 },
    { value: invScore,       weight: 30 },
    { value: pivotReadiness, weight: 35 },
  ]);

  const mono     = (mai.business?.monetisation_model  || 'unknown').toLowerCase();
  const oppRat   = (mai.business?.opportunity_rating  || 'unknown').toLowerCase();
  const viab     = (dec.viability || '').toLowerCase();
  const projName = a.project_name || 'This project';

  let outcome_prediction;
  if (viab === 'low' || dec.build_recommendation === 'pivot')
    outcome_prediction = 'A pivot is supported by the stored decision signals — current direction is rated low viability. Repositioning ' + projName + ' toward adjacent opportunities may unlock better product-market fit.';
  else if (oppRat && oppRat !== 'unknown' && !oppRat.includes('low'))
    outcome_prediction = 'Pivoting ' + projName + ' from its current ' + mono + ' model carries risk but the stored opportunity rating ("' + oppRat + '") suggests underlying market value that could be repackaged differently.';
  else if (bizScore >= 60)
    outcome_prediction = 'Pivoting ' + projName + ' is not strongly indicated by stored signals — the current business model has reasonable scores. A partial pivot (adjacent model) may be lower-risk than a full repositioning.';
  else
    outcome_prediction = 'Insufficient stored intelligence to predict pivot outcomes with confidence — stored signals do not clearly favour or oppose a business model change.';

  const risk_factors = wiCleanArr([
    ...(mai.risk?.market_risks            || []),
    ...(fus.biggest_risks                 || []).slice(0, 1),
    'Loss of existing user base during transition',
  ], 3);
  const opportunity_factors = wiCleanArr([
    ...(mai.growth?.expansion_ideas       || []),
    ...(fus.strongest_opportunities       || []).slice(0, 2),
  ], 3);

  return {
    scenario:           '[HYPOTHETICAL] Business pivot — what if the core model or target market is repositioned?',
    outcome_prediction,
    risk_factors:       risk_factors.length       ? risk_factors       : ['Insufficient risk data in stored intelligence'],
    opportunity_factors:opportunity_factors.length ? opportunity_factors : ['Insufficient opportunity data in stored intelligence'],
    feasibility_score,
  };
}

/**
 * buildMarketExpansionScenario(a, mai, fus, dec, sig)
 *
 * [HYPOTHETICAL] What if the project expands into new verticals or geographies?
 *
 * Feasibility: investor_score (35%) + scalability_score (35%) + business_score (30%)
 * Outcome:     conditioned on market_opportunity + funding_potential + industry
 */
function buildMarketExpansionScenario(a, mai, fus, dec, sig) {
  const invScore  = parseInt(a.investor_score,    10) || 0;
  const scalScore = parseInt(a.scalability_score, 10) || 0;
  const bizScore  = parseInt(a.business_score,    10) || 0;

  const feasibility_score = wiScore([
    { value: invScore,  weight: 35 },
    { value: scalScore, weight: 35 },
    { value: bizScore,  weight: 30 },
  ]);

  const industry      = (mai.research?.industry        || 'unknown').toLowerCase();
  const mktOpp        = (mai.investor?.market_opportunity || '').toLowerCase();
  const fundPotential = (mai.investor?.funding_potential  || '').toLowerCase();
  const projName      = a.project_name || 'This project';

  let outcome_prediction;
  if (feasibility_score >= 70 && fundPotential && !isSentinel(fundPotential))
    outcome_prediction = projName + ' shows strong expansion prerequisites — investor scores and scalability signals support entering new verticals. Stored funding potential ("' + fundPotential + '") suggests external capital access is plausible.';
  else if (feasibility_score >= 50 && industry && industry !== 'unknown')
    outcome_prediction = 'Market expansion for ' + projName + ' within or adjacent to the "' + industry + '" sector is moderately feasible — scaling signals are present but investor readiness may constrain pace.';
  else if (mktOpp && !isSentinel(mktOpp))
    outcome_prediction = 'Stored market opportunity signals suggest expansion potential exists for ' + projName + ', though feasibility is moderate — execution would require strengthening the investor and scalability foundations first.';
  else
    outcome_prediction = 'Insufficient stored intelligence on market context to predict expansion outcomes — proceed with targeted market analysis before committing to new verticals.';

  const risk_factors = wiCleanArr([
    ...(mai.risk?.market_risks              || []),
    ...(mai.risk?.operational_concerns      || []).slice(0, 1),
  ], 3);
  const opportunity_factors = wiCleanArr([
    ...(mai.growth?.partnership_potential   ? [mai.growth.partnership_potential] : []),
    ...(mai.investor?.investment_signals    || []).slice(0, 2),
    ...(fus.strongest_opportunities         || []).slice(0, 1),
  ], 3);

  return {
    scenario:           '[HYPOTHETICAL] Market expansion — what if this project enters new verticals or geographies?',
    outcome_prediction,
    risk_factors:       risk_factors.length       ? risk_factors       : ['Insufficient risk data in stored intelligence'],
    opportunity_factors:opportunity_factors.length ? opportunity_factors : ['Insufficient opportunity data in stored intelligence'],
    feasibility_score,
  };
}

/**
 * buildWindDownScenario(a, mai, fus, dec, sig)
 *
 * [HYPOTHETICAL] What if development is halted and the project is wound down?
 *
 * Feasibility (of wind-down making sense): inverted viability + risk_level score
 *   High risk + low viability = wind-down is more justifiable = higher feasibility
 * Outcome:     conditioned on build_rec + overall_risk_level + confidence_score
 */
function buildWindDownScenario(a, mai, fus, dec, sig) {
  const bizScore   = parseInt(a.business_score,   10) || 50;
  const riskLevel  = (mai.risk?.overall_risk_level || '').toLowerCase();
  const buildRec   = (dec.build_recommendation    || '').toLowerCase();
  const confidence = parseInt(dec.confidence_score, 10) || 50;

  // Wind-down feasibility = how strongly signals point AWAY from continuing
  const riskScore = riskLevel.includes('high') ? 80 : riskLevel.includes('med') ? 50 : 20;
  const avoidBonus = buildRec === 'avoid' ? 80 : buildRec === 'pivot' ? 50 : 20;
  const lowBizBonus = bizScore < 40 ? 70 : bizScore < 55 ? 40 : 15;

  const feasibility_score = wiScore([
    { value: riskScore,   weight: 35 },
    { value: avoidBonus,  weight: 40 },
    { value: lowBizBonus, weight: 25 },
  ]);

  const projName = a.project_name || 'This project';
  let outcome_prediction;
  if (buildRec === 'avoid' && feasibility_score >= 60)
    outcome_prediction = 'Stored decision signals actively recommend against continuing ' + projName + ' — a wind-down would align with the intelligence layer's assessment and allow resource reallocation to higher-viability opportunities.';
  else if (riskLevel.includes('high'))
    outcome_prediction = 'Winding down ' + projName + ' would eliminate high-risk exposure — however, stored signals also indicate unrealised opportunities that would be forfeited. A partial wind-down or pivot may be preferable.';
  else if (bizScore >= 60)
    outcome_prediction = 'A wind-down of ' + projName + ' is not strongly supported by stored signals — business scores are reasonable and decision confidence suggests continued development is the more logical path.';
  else
    outcome_prediction = 'Wind-down feasibility is ambiguous based on stored signals — the project sits in a mid-range zone where continuation with a revised strategy may outperform either scaling or abandonment.';

  const risk_factors = wiCleanArr([
    'Permanent loss of invested development effort and institutional knowledge',
    ...(mai.risk?.operational_concerns || []).slice(0, 1),
    ...(fus.biggest_risks              || []).slice(0, 1),
  ], 3);
  const opportunity_factors = wiCleanArr([
    'Resource reallocation to higher-viability portfolio projects',
    ...(fus.strongest_opportunities    || []).slice(0, 1),
  ], 3);

  return {
    scenario:           '[HYPOTHETICAL] Wind-down — what if development is halted and the project is not pursued further?',
    outcome_prediction,
    risk_factors:       risk_factors.length       ? risk_factors       : ['Insufficient risk data in stored intelligence'],
    opportunity_factors:opportunity_factors.length ? opportunity_factors : ['Insufficient opportunity data in stored intelligence'],
    feasibility_score,
  };
}

/**
 * buildWhatIfEngine(project)
 *
 * Entry point — generates the spec-exact what_if_engine object for one project.
 * Reads only stored Phase 1-13 intelligence. No AI calls. No external data.
 * Deterministic. All scenario labels are prefixed [HYPOTHETICAL].
 *
 * Returns spec-exact what_if_engine: { scenarios: Scenario[] }
 */
function buildWhatIfEngine(project) {
  const a   = project.analysis     || {};
  const dt  = project.digital_twin || {};
  const mai = dt.multi_agent_intelligence || a.multi_agent_intelligence || {};
  const fus = dt.intelligence_fusion     || a.intelligence_fusion      || {};
  const dec = dt.decision_engine         || a.decision_engine          || {};

  // Guard: need at least Phase 2 data to reason
  if (!a.project_name) {
    return { ...WHATIF_FALLBACK.what_if_engine };
  }

  // Build enriched signature for categorical fields
  let sig;
  try { sig = enrichSignature(project); }
  catch { sig = {}; }

  const scenarios = [];
  const builders = [
    buildScaleScenario,
    buildAIIntegrationScenario,
    buildPivotScenario,
    buildMarketExpansionScenario,
    buildWindDownScenario,
  ];

  builders.forEach(fn => {
    try {
      scenarios.push(fn(a, mai, fus, dec, sig));
    } catch (e) {
      console.warn('[AP3XVER5E] What-if scenario failed (skipped):', e.message);
    }
  });

  return { scenarios };
}

// ═══════════════════════════════════════════════════
// SECTION 7 — Navigation
// ═══════════════════════════════════════════════════
const views = {
  dashboard: document.getElementById('view-dashboard'),
  project:   document.getElementById('view-project'),
};
const headerBack   = document.getElementById('header-back');
const headerTitle  = document.getElementById('header-title');
const backBtnFloat = document.getElementById('back-btn-float');

function showView(name) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[name].classList.add('active');
  const onProject = name === 'project';
  headerBack.classList.toggle('visible', onProject);
  backBtnFloat.classList.toggle('visible', onProject);
  headerTitle.textContent = onProject ? (currentProject?.url ? domainOf(currentProject.url) : '') : '';
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function navBack() { showView('dashboard'); }
headerBack.addEventListener('click', navBack);
backBtnFloat.addEventListener('click', navBack);


// ═══════════════════════════════════════════════════
// SECTION 8 — Status UI
// ═══════════════════════════════════════════════════
const statusRow  = document.getElementById('status-row');
const statusText = document.getElementById('status-text');
let _statusTimer = null;

function setStatus(msg, isError = false) {
  if (_statusTimer) { clearTimeout(_statusTimer); _statusTimer = null; }
  statusRow.classList.add('visible');
  statusRow.classList.toggle('error', isError);
  statusText.textContent = msg;
  if (isError) _statusTimer = setTimeout(clearStatus, 7000);
}
function clearStatus() {
  statusRow.classList.remove('visible', 'error');
  statusText.textContent = '';
}


// ═══════════════════════════════════════════════════
// SECTION 9 — Analyse Pipeline
// ═══════════════════════════════════════════════════
const urlInput   = document.getElementById('url-input');
const analyseBtn = document.getElementById('analyse-btn');
let _analysisInFlight = false;

analyseBtn.addEventListener('click', runAnalysis);
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') runAnalysis(); });

async function runAnalysis() {
  if (_analysisInFlight) return;
  const raw = urlInput.value.trim();
  if (!raw) { setStatus('Enter a URL to analyse.', true); return; }
  if (!isValidURL(raw)) { setStatus('Invalid URL — try including https://', true); return; }

  const url = normalizeURL(raw);

  // Guard: require API key before doing any network work
  if (!window.AP3X_API_KEY) {
    setStatus('No OpenAI API key — add your key in the Configuration section below.', true);
    return;
  }

  _analysisInFlight = true;
  analyseBtn.disabled = true;
  analyseBtn.textContent = '...';

  try {
    // Dedup check
    let existing = await dbFindByURL(url).catch(() => null);
    if (existing) {
      existing = await dbMigrateTwin(existing);  // ensure twin present
      urlInput.value = '';
      clearStatus();
      openProjectViewer(existing);
      setStatus('Already analysed — showing saved result.', false);
      setTimeout(clearStatus, 4000);
      return;
    }

    setStatus('Layer 1 — Fetching page content...');
    let content;
    try { content = await extractContent(url); }
    catch (e) { throw new Error(e.message || 'Unable to fetch website.'); }

    const analysis = await analyzeWithAI(content, url);

    setStatus('Layer 3 — Running intelligence agents...');
    const agentOutputs = await runAgents(content);
    analysis.multi_agent_intelligence = agentOutputs;

    setStatus('Layer 3 — Fusing intelligence...');
    const fusionOutput = await runFusion(agentOutputs, analysis);
    analysis.intelligence_fusion = fusionOutput;

    setStatus('Layer 3 — Running decision engine...');
    const decisionOutput = await runDecisionEngine(fusionOutput, analysis);
    analysis.decision_engine = decisionOutput;

    setStatus('Layer 1 — Saving project...');
    const project = {
      id:           uid(),
      url,
      created_at:   new Date().toISOString(),
      analysis,                          // flat — kept for backward compat
      digital_twin: buildDigitalTwin(analysis),  // structured intelligence envelope
      version:      25,
    };

    validateProject(project);

    try { await dbPut(project); }
    catch (e) { throw new Error('Unable to save project locally — ' + e.message); }

    // ── Cross-Project Intelligence Memory ──
    // Runs after dbPut so the new project is already in the store.
    // Reads all stored projects, computes links, patches the record.
    try {
      setStatus('Layer 4 — Linking cross-project intelligence...');
      const allProjects = await dbGetAll();
      const crossLinks  = buildCrossProjectLinks(project, allProjects);
      project.analysis.cross_project_links = crossLinks;
      project.digital_twin.cross_project_links = crossLinks;
      await dbPut(project);  // patch with cross-links
    } catch (e) {
      console.warn('[AP3XVER5E] Cross-project linking failed (non-fatal):', e.message);
      project.analysis.cross_project_links    = { ...CROSS_FALLBACK.cross_project_links };
      project.digital_twin.cross_project_links = { ...CROSS_FALLBACK.cross_project_links };
    }

    // ── Knowledge Graph Engine (Phase 4) ──
    // Runs last — after cross-links — so the graph sees the fully enriched project.
    // The graph is GLOBAL (all projects), stored on the current project as a snapshot.
    try {
      setStatus('Layer 4 — Building knowledge graph...');
      const graphProjects = await dbGetAll();
      const knowledgeGraph = buildKnowledgeGraph(graphProjects);
      project.analysis.knowledge_graph    = knowledgeGraph;
      project.digital_twin.knowledge_graph = knowledgeGraph;
      await dbPut(project);  // patch with knowledge graph
    } catch (e) {
      console.warn('[AP3XVER5E] Knowledge graph build failed (non-fatal):', e.message);
      project.analysis.knowledge_graph    = { ...GRAPH_FALLBACK.knowledge_graph };
      project.digital_twin.knowledge_graph = { ...GRAPH_FALLBACK.knowledge_graph };
    }

    // ── Semantic Memory Layer (Phase 5) ──
    // Runs last — after KG — so clusterMembership is available from the stored graph.
    // Derives semantic_memory purely from existing Phase 1-4 stored data.
    try {
      setStatus('Layer 5 — Building semantic memory...');
      // Rebuild clusterMembership from the stored knowledge graph clusters
      const storedKG = project.analysis.knowledge_graph || {};
      const semMembershipByName = buildClusterMembership(storedKG.intelligence_clusters || []);
      const semClusterMembership = new Map();
      // For the current project, resolve by matching project name in cluster.projects
      const projectName = project.analysis?.project_name
        || (project.url ? (() => { try { return new URL(project.url).hostname; } catch { return project.id; } })() : project.id);
      const semClusters = semMembershipByName.get(projectName) || [];
      semClusterMembership.set(project.id, semClusters);
      const semanticMemory = buildSemanticMemory(project, semClusterMembership);
      project.analysis.semantic_memory    = semanticMemory;
      project.digital_twin.semantic_memory = semanticMemory;
      await dbPut(project);  // patch with semantic memory
    } catch (e) {
      console.warn('[AP3XVER5E] Semantic memory build failed (non-fatal):', e.message);
      project.analysis.semantic_memory    = { ...SEMANTIC_FALLBACK.semantic_memory };
      project.digital_twin.semantic_memory = { ...SEMANTIC_FALLBACK.semantic_memory };
    }

    // ── Cross-Project Reasoning Engine (Phase 6) ──
    // Runs last — reads ALL stored projects to reason across the full portfolio.
    // Stored on the current project as a portfolio-level snapshot.
    try {
      setStatus('Layer 6 — Computing cross-project reasoning...');
      const reasoningProjects = await dbGetAll();
      const crossReasoning    = buildCrossProjectReasoning(reasoningProjects);
      project.analysis.cross_project_reasoning    = crossReasoning;
      project.digital_twin.cross_project_reasoning = crossReasoning;
      await dbPut(project);  // patch with cross-project reasoning
    } catch (e) {
      console.warn('[AP3XVER5E] Cross-project reasoning failed (non-fatal):', e.message);
      project.analysis.cross_project_reasoning    = { ...REASONING_FALLBACK.cross_project_reasoning };
      project.digital_twin.cross_project_reasoning = { ...REASONING_FALLBACK.cross_project_reasoning };
    }

    // ── Portfolio Intelligence Report (Phase 7) ──
    // Runs last — reads ALL stored projects to generate a portfolio-level report.
    // Reuses Phase 6 cross_project_reasoning output where available.
    try {
      setStatus('Layer 7 — Generating portfolio intelligence report...');
      const portfolioProjects = await dbGetAll();
      const portfolioReport   = buildPortfolioIntelligenceReport(portfolioProjects);
      project.analysis.portfolio_intelligence_report    = portfolioReport;
      project.digital_twin.portfolio_intelligence_report = portfolioReport;
      await dbPut(project);  // patch with portfolio intelligence report
    } catch (e) {
      console.warn('[AP3XVER5E] Portfolio intelligence report failed (non-fatal):', e.message);
      project.analysis.portfolio_intelligence_report    = { ...PORTFOLIO_FALLBACK.portfolio_intelligence_report };
      project.digital_twin.portfolio_intelligence_report = { ...PORTFOLIO_FALLBACK.portfolio_intelligence_report };
    }

    // ── Portfolio Visual Map (Phase 8) ──
    // Runs last — reads ALL stored projects and their stored KG to build
    // the spec-exact visual map data structure for graph/visualization layers.
    try {
      setStatus('Layer 8 — Building portfolio visual map...');
      const visualMapProjects = await dbGetAll();
      const portfolioVisualMap = buildPortfolioVisualMap(visualMapProjects);
      project.analysis.portfolio_visual_map    = portfolioVisualMap;
      project.digital_twin.portfolio_visual_map = portfolioVisualMap;
      await dbPut(project);  // patch with portfolio visual map
    } catch (e) {
      console.warn('[AP3XVER5E] Portfolio visual map failed (non-fatal):', e.message);
      project.analysis.portfolio_visual_map    = { ...VISUAL_MAP_FALLBACK.portfolio_visual_map };
      project.digital_twin.portfolio_visual_map = { ...VISUAL_MAP_FALLBACK.portfolio_visual_map };
    }

    // ── Reasoning Trace (Phase 9 — Reasoning Explanation Layer) ──
    try {
      setStatus('Layer 9 — Building reasoning trace...');
      const reasoningTrace = buildReasoningTrace(project);
      project.analysis.reasoning_trace    = reasoningTrace;
      project.digital_twin.reasoning_trace = reasoningTrace;
      await dbPut(project);  // patch with reasoning trace
    } catch (e) {
      console.warn('[AP3XVER5E] Reasoning trace failed (non-fatal):', e.message);
      project.analysis.reasoning_trace    = { ...TRACE_FALLBACK.reasoning_trace };
      project.digital_twin.reasoning_trace = { ...TRACE_FALLBACK.reasoning_trace };
    }

    // ── Confidence & Uncertainty Model (Phase 10) ──
    try {
      setStatus('Layer 10 — Computing confidence model...');
      const confidenceModel = buildConfidenceModel(project);
      project.analysis.confidence_model    = confidenceModel;
      project.digital_twin.confidence_model = confidenceModel;
      await dbPut(project);  // patch with confidence model
    } catch (e) {
      console.warn('[AP3XVER5E] Confidence model failed (non-fatal):', e.message);
      project.analysis.confidence_model    = { ...CONFIDENCE_FALLBACK.confidence_model };
      project.digital_twin.confidence_model = { ...CONFIDENCE_FALLBACK.confidence_model };
    }

    // ── Project Comparison Engine (Phase 11) ──
    // Generates all unique project pairs from the full portfolio.
    // Written to ALL projects so every twin reflects the latest comparison state.
    try {
      setStatus('Layer 11 — Computing project comparisons...');
      const allProjectsForComp = await dbGetAll();
      const compEngine = buildComparisonEngine(allProjectsForComp);
      // Patch every project in the portfolio with the latest comparison engine
      for (const p of allProjectsForComp) {
        if (!p.analysis) continue;
        p.analysis.comparison_engine    = compEngine;
        if (p.digital_twin) p.digital_twin.comparison_engine = compEngine;
        await dbPut(p);
      }
    } catch (e) {
      console.warn('[AP3XVER5E] Comparison engine failed (non-fatal):', e.message);
      project.analysis.comparison_engine    = { ...COMPARISON_FALLBACK.comparison_engine };
      project.digital_twin.comparison_engine = { ...COMPARISON_FALLBACK.comparison_engine };
    }

    // ── Builder Profile Intelligence Engine (Phase 12) ──
    // Analyses the full portfolio to generate an intelligence profile
    // of the builder. Written to ALL projects so every twin is current.
    try {
      setStatus('Layer 12 — Building builder intelligence profile...');
      const allProjectsForProfile = await dbGetAll();
      const builderProfile = buildBuilderProfile(allProjectsForProfile);
      // Patch every project in the portfolio with the latest builder profile
      for (const bp of allProjectsForProfile) {
        if (!bp.analysis) continue;
        bp.analysis.builder_profile    = builderProfile;
        if (bp.digital_twin) bp.digital_twin.builder_profile = builderProfile;
        await dbPut(bp);
      }
    } catch (e) {
      console.warn('[AP3XVER5E] Builder profile failed (non-fatal):', e.message);
      project.analysis.builder_profile    = { ...BUILDER_FALLBACK.builder_profile };
      project.digital_twin.builder_profile = { ...BUILDER_FALLBACK.builder_profile };
    }

    // ── System Evolution Tracking Layer (Phase 13) ──
    // Reads full portfolio sorted by created_at, computes progression
    // snapshots and maturity metrics. Written to ALL projects.
    try {
      setStatus('Layer 13 — Computing system evolution...');
      const allProjectsForEvo = await dbGetAll();
      const evolutionTracker  = buildEvolutionTracker(allProjectsForEvo);
      // Patch every project in the portfolio with the latest evolution tracker
      for (const ep of allProjectsForEvo) {
        if (!ep.analysis) continue;
        ep.analysis.evolution_tracker    = evolutionTracker;
        if (ep.digital_twin) ep.digital_twin.evolution_tracker = evolutionTracker;
        await dbPut(ep);
      }
    } catch (e) {
      console.warn('[AP3XVER5E] Evolution tracker failed (non-fatal):', e.message);
      project.analysis.evolution_tracker    = { ...EVOLUTION_FALLBACK.evolution_tracker };
      project.digital_twin.evolution_tracker = { ...EVOLUTION_FALLBACK.evolution_tracker };
    }

    // ── What-If Simulation Engine (Phase 14) ──
    // Per-project hypothetical reasoning derived from stored intelligence only.
    // All scenarios are clearly labelled [HYPOTHETICAL].
    try {
      setStatus('Layer 14 — Simulating what-if scenarios...');
      const whatIfEngine = buildWhatIfEngine(project);
      project.analysis.what_if_engine    = whatIfEngine;
      project.digital_twin.what_if_engine = whatIfEngine;
      await dbPut(project);  // patch with what-if engine
    } catch (e) {
      console.warn('[AP3XVER5E] What-if engine failed (non-fatal):', e.message);
      project.analysis.what_if_engine    = { ...WHATIF_FALLBACK.what_if_engine };
      project.digital_twin.what_if_engine = { ...WHATIF_FALLBACK.what_if_engine };
    }

    urlInput.value = '';
    clearStatus();
    await renderProjects();
    openProjectViewer(project);

  } catch (err) {
    console.error('[AP3XVER5E]', err);
    setStatus(err.message || 'Something went wrong. Please try again.', true);
  } finally {
    _analysisInFlight = false;
    analyseBtn.disabled = false;
    analyseBtn.textContent = 'RUN ANALYSIS';
  }
}


// ═══════════════════════════════════════════════════
// SECTION 10 — Dashboard Render
// ═══════════════════════════════════════════════════
const projectsContainer = document.getElementById('projects-container');

async function renderProjects() {
  let all;
  try { all = await dbGetAll(); }
  catch (e) {
    projectsContainer.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠</span>Could not load saved projects.<br>${esc(e.message)}</div>`;
    return;
  }

  const valid = all.filter(p => p && p.id && p.url && p.analysis);
  valid.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (!valid.length) {
    projectsContainer.innerHTML = `<div class="empty-state"><span class="empty-icon">⬡</span>No projects yet. Enter a URL above to start.</div>`;
    return;
  }

  projectsContainer.innerHTML = valid.map(p => {
    const name    = esc(p.analysis?.project_name || domainOf(p.url));
    const isV2    = p.version === 2;
    const badge   = isV2
      ? `<span style="font-family:var(--mono);font-size:0.58rem;color:var(--accent);border:1px solid rgba(0,232,122,0.3);padding:2px 6px;border-radius:10px;margin-left:6px;">5 REPORTS</span>`
      : '';
    return `
    <div class="project-card" data-id="${esc(p.id)}">
      <div class="card-icon">${emojiFor(p.url)}</div>
      <div class="card-info">
        <div class="card-name">${name}${badge}</div>
        <div class="card-url">${esc(p.url)}</div>
      </div>
      <div class="card-date">${fmtDateShort(p.created_at)}</div>
      <div class="card-arrow">›</div>
      <button class="card-delete-btn" data-id="${esc(p.id)}" title="Delete">✕</button>
    </div>`;
  }).join('');

  projectsContainer.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', async (e) => {
      if (e.target.classList.contains('card-delete-btn')) return;
      try {
        const all2 = await dbGetAll();
        let proj = all2.find(p => p.id === card.dataset.id);
        if (proj) {
          proj = await dbMigrateTwin(proj);  // back-fill twin on legacy records
          openProjectViewer(proj);
        }
      } catch (e) { setStatus('Unable to open project — ' + e.message, true); }
    });
  });

  projectsContainer.querySelectorAll('.card-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this project?')) return;
      try { await dbDelete(btn.dataset.id); await renderProjects(); }
      catch (e) { setStatus('Unable to delete — ' + e.message, true); }
    });
  });
}


// ═══════════════════════════════════════════════════
// SECTION 11 — Project Viewer (Phase 2 reports)
// ═══════════════════════════════════════════════════
let currentProject = null;

/* ── Helpers ── */
function renderTextBlock(val) {
  return `<div class="block-text">${esc(val || '—')}</div>`;
}

function renderList(items) {
  const safe = Array.isArray(items) ? items : [];
  if (!safe.length) return `<div class="list-item"><span class="list-bullet">→</span><span>No data.</span></div>`;
  return safe.map(i => `<div class="list-item"><span class="list-bullet">→</span><span>${esc(i)}</span></div>`).join('');
}

function renderKV(pairs) {
  // pairs: [[label, value], ...]  — value may be string or array
  return pairs.map(([label, val]) => {
    const isArr = Array.isArray(val);
    return `
    <div class="kv-row">
      <div class="kv-label">${esc(label)}</div>
      <div class="kv-value">${isArr
        ? val.map(v => `<span class="kv-tag">${esc(v)}</span>`).join('')
        : esc(val || '—')
      }</div>
    </div>`;
  }).join('');
}

function renderBadge(val, map) {
  // map: { Low:'green', Medium:'amber', High:'red' }
  const colour = map[val] || 'neutral';
  return `<span class="risk-badge risk-${colour}">${esc(val || 'Unknown')}</span>`;
}

/* ── Report definitions ── */
function buildReportSections(a) {
  const isV2 = a.report_overview !== undefined;

  // ── PHASE 1 base sections (always shown) ──
  const sections = [
    {
      key: 'p1_summary', label: 'Project Summary', icon: '📋', special: '',
      html: renderTextBlock(a.project_summary),
    },
    {
      key: 'p1_features', label: 'Key Features', icon: '✦', special: '',
      html: `<div class="block-list">${renderList(a.features)}</div>`,
    },
    {
      key: 'p1_biz', label: 'Business Model', icon: '💰', special: '',
      html: renderTextBlock(a.business_model),
    },
    {
      key: 'p1_audience', label: 'Target Audience', icon: '🎯', special: '',
      html: renderTextBlock(a.target_audience),
    },
    {
      key: 'p1_tech', label: 'Technical Signals', icon: '⚙', special: '',
      html: `<div class="block-list">${renderList(a.technical_signals)}</div>`,
    },
    {
      key: 'p1_improve', label: 'Improvements', icon: '↑', special: '',
      html: `<div class="block-list">${renderList(a.improvements)}</div>`,
    },
    {
      key: 'p1_investor', label: 'Investor Summary', icon: '⬡', special: 'investor',
      html: renderTextBlock(a.investor_summary),
    },
  ];

  if (!isV2) return sections;

  // ── PHASE 2 report sections ──
  const ov  = a.report_overview   || {};
  const biz = a.report_business   || {};
  const tec = a.report_technical  || {};
  const inv = a.report_investor   || {};
  const rdm = a.report_roadmap    || {};

  const p2sections = [
    // ── Report 1: Project Overview ──
    {
      key: 'r1_overview', label: 'Report 1 — Project Overview', icon: '🗂', special: 'report-header',
      html: renderKV([
        ['What it is',    ov.what_it_is],
        ['What it does',  ov.what_it_does],
        ['Who it serves', ov.who_it_serves],
      ]),
    },

    // ── Report 2: Business Intelligence ──
    {
      key: 'r2_business', label: 'Report 2 — Business Intelligence', icon: '💹', special: 'report-header',
      html: renderKV([
        ['Revenue Model',      biz.revenue_model],
        ['Monetisation',       biz.monetisation],
        ['Market Type',        biz.market_type],
        ['Customer Segments',  biz.customer_segments],
      ]),
    },

    // ── Report 3: Technical Intelligence ──
    {
      key: 'r3_technical', label: 'Report 3 — Technical Intelligence', icon: '🔬', special: 'report-header',
      html: renderKV([
        ['Stack Signals',     tec.stack_signals],
        ['Architecture',      tec.architecture_assumptions],
        ['Complexity',        tec.complexity_level],
        ['Scalability',       tec.scalability_notes],
      ]),
    },

    // ── Report 4: Investor Readiness ──
    {
      key: 'r4_investor', label: 'Report 4 — Investor Readiness', icon: '📈', special: 'report-header investor',
      html: `
        ${renderKV([
          ['Value Proposition',  inv.value_proposition],
          ['Market Opportunity', inv.market_opportunity],
        ])}
        <div class="kv-row">
          <div class="kv-label">Risk Level</div>
          <div class="kv-value">${renderBadge(inv.risk_level, { Low:'green', Medium:'amber', High:'red' })}</div>
        </div>
        <div class="kv-row">
          <div class="kv-label">Growth Potential</div>
          <div class="kv-value">${renderBadge(inv.growth_potential?.split(' ')[0], { Low:'amber', Medium:'green', High:'green' })} <span style="color:var(--text-2);font-size:0.82rem;margin-left:6px;">${esc(inv.growth_potential || '')}</span></div>
        </div>`,
    },

    // ── Report 5: Improvement Roadmap ──
    {
      key: 'r5_roadmap', label: 'Report 5 — Improvement Roadmap', icon: '🛣', special: 'report-header',
      html: `
        <div class="roadmap-group">
          <div class="roadmap-group-label">Immediate Fixes</div>
          <div class="block-list">${renderList(rdm.immediate_fixes)}</div>
        </div>
        <div class="roadmap-group">
          <div class="roadmap-group-label">Growth Opportunities</div>
          <div class="block-list">${renderList(rdm.growth_opportunities)}</div>
        </div>
        <div class="roadmap-group">
          <div class="roadmap-group-label">Feature Suggestions</div>
          <div class="block-list">${renderList(rdm.feature_suggestions)}</div>
        </div>`,
    },
  ];

  // ── Phase 4: Competitor Analysis ──
  const ca = a.competitor_analysis || {};
  if (ca.possible_competitors || ca.market_position) {
    p2sections.push({
      key: 'r6_competitors', label: 'Report 6 — Competitive Intelligence', icon: '⚔', special: 'report-header',
      html: `
        ${renderKV([
          ['Market Position', ca.market_position],
        ])}
        <div class='kv-row'>
          <div class='kv-label'>Competitors</div>
          <div class='kv-value'>${(Array.isArray(ca.possible_competitors) ? ca.possible_competitors : []).map(c => `<span class='kv-tag'>${esc(c)}</span>`).join('')}</div>
        </div>
        <div class='kv-row'>
          <div class='kv-label'>Differentiation</div>
          <div class='kv-value' style='flex-direction:column;gap:0;'><div class='block-list' style='margin:0;'>${renderList(ca.differentiation_points)}</div></div>
        </div>
        <div class='kv-row'>
          <div class='kv-label'>Weaknesses</div>
          <div class='kv-value' style='flex-direction:column;gap:0;'><div class='block-list' style='margin:0;'>${renderList(ca.weakness_vs_market)}</div></div>
        </div>`,
    });
  }

  // ── Phase 5: Insight Summary ──
  const ins = a.insight_summary || {};
  if (ins.verdict || (Array.isArray(ins.strengths) && ins.strengths.length)) {
    p2sections.push({
      key: 'r7_insight', label: 'Insight Summary', icon: '💡', special: 'report-header insight-block',
      html: `
        <div class='roadmap-group'>
          <div class='roadmap-group-label'>Key Strengths</div>
          <div class='block-list'>${renderList(ins.strengths)}</div>
        </div>
        <div class='roadmap-group'>
          <div class='roadmap-group-label'>Key Risks</div>
          <div class='block-list'>${renderList(ins.risks)}</div>
        </div>
        <div class='roadmap-group'>
          <div class='roadmap-group-label'>Growth Opportunities</div>
          <div class='block-list'>${renderList(ins.growth_opportunities)}</div>
        </div>
        <div class='insight-verdict'>
          <div class='insight-verdict-label'>VERDICT</div>
          <div class='insight-verdict-text'>${esc(ins.verdict || '—')}</div>
        </div>`,
    });
  }

  return [...sections, ...p2sections];
}

function openProjectViewer(project) {
  currentProject = project;
  const a = project.analysis || {};

  document.getElementById('viewer-url').textContent  = project.url;
  document.getElementById('viewer-date').textContent = fmtDate(project.created_at);

  const sectionsEl = document.getElementById('analysis-sections');
  const allSections = buildReportSections(a);

  sectionsEl.innerHTML = allSections.map((s, i) => `
    <div class="analysis-block ${s.special || ''} ${i === 0 ? 'open' : ''}" data-key="${s.key}">
      <div class="block-header">
        <div class="block-header-left">
          <div class="block-icon">${s.icon}</div>
          <div class="block-title">${s.label}</div>
        </div>
        <div class="block-chevron">▾</div>
      </div>
      <div class="block-body">${s.html}</div>
    </div>`).join('');

  sectionsEl.querySelectorAll('.block-header').forEach(h => {
    h.addEventListener('click', () => h.closest('.analysis-block').classList.toggle('open'));
  });

  showView('project');
}


// ═══════════════════════════════════════════════════
// SECTION 12 — API Key Management
// ═══════════════════════════════════════════════════
const apiKeyInput = document.getElementById('api-key-input');
const saveKeyBtn  = document.getElementById('save-key-btn');
const keyStatus   = document.getElementById('key-status');

function loadKey() {
  try {
    const k = localStorage.getItem('ap3x_openai_key');
    if (k) {
      window.AP3X_API_KEY = k;
      // Show masked key in input so user knows a key is saved
      apiKeyInput.value   = '•'.repeat(Math.min(k.length, 24));
      keyStatusEl.textContent = '✓ Key loaded';
      keyStatusEl.style.color  = 'var(--accent)';
    } else {
      keyStatusEl.textContent = 'No key saved — enter your OpenAI key below';
      keyStatusEl.style.color  = 'var(--text-2)';
    }
  } catch {}
}

saveKeyBtn.addEventListener('click', () => {
  const k = apiKeyInput.value.trim();
  if (!k || /^•+$/.test(k)) { keyStatus.textContent = 'No changes.'; keyStatus.style.color = 'var(--text-3)'; return; }
  if (!k.startsWith('sk-')) { keyStatus.textContent = '✗ Must start with sk-'; keyStatus.style.color = 'var(--danger)'; return; }
  try {
    localStorage.setItem('ap3x_openai_key', k);
    window.AP3X_API_KEY   = k;
    apiKeyInput.value     = '•'.repeat(Math.min(k.length, 24));
    keyStatus.textContent = '✓ Key saved locally';
    keyStatus.style.color = 'var(--accent)';
  } catch (e) { keyStatus.textContent = '✗ ' + e.message; keyStatus.style.color = 'var(--danger)'; }
});

apiKeyInput.addEventListener('focus', () => { try { const k = localStorage.getItem('ap3x_openai_key'); if (k) apiKeyInput.value = k; } catch {} });
apiKeyInput.addEventListener('blur',  () => { try { const k = localStorage.getItem('ap3x_openai_key'); if (k) apiKeyInput.value = '•'.repeat(Math.min(k.length,24)); } catch {} });


// ═══════════════════════════════════════════════════
// SECTION 13 — PWA Install
// ═══════════════════════════════════════════════════
let deferredPrompt  = null;
const installBanner = document.getElementById('install-banner');
const installBtn    = document.getElementById('install-btn');

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; installBanner.classList.add('visible'); });
installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  try { deferredPrompt.prompt(); const { outcome } = await deferredPrompt.userChoice; if (outcome === 'accepted') installBanner.classList.remove('visible'); }
  catch (e) { console.warn('Install prompt error:', e); }
  finally { deferredPrompt = null; }
});
window.addEventListener('appinstalled', () => { installBanner.classList.remove('visible'); });


// ═══════════════════════════════════════════════════
// SECTION 14 — Service Worker
// ═══════════════════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW reg failed:', e));
  });
}


// ═══════════════════════════════════════════════════
// SECTION 15 — Init
// ═══════════════════════════════════════════════════
// Global error handlers — catch uncaught errors in production
window.onerror = function(msg, src, line, col, err) {
  console.error('[AP3XVER5E] Uncaught error:', msg, 'at', src + ':' + line);
  try {
    const statusRow = document.getElementById('status-row');
    const statusText = document.getElementById('status-text');
    if (statusRow && statusText) {
      statusRow.classList.add('visible', 'error');
      statusText.textContent = 'Unexpected error: ' + (msg || 'unknown');
    }
  } catch {}
  return false;
};
window.addEventListener('unhandledrejection', (e) => {
  console.error('[AP3XVER5E] Unhandled promise rejection:', e.reason);
});

(async () => {
  try { await openDB(); }
  catch (e) { console.error('[AP3XVER5E] DB init failed:', e); setStatus('Storage unavailable — ' + e.message, true); return; }
  loadKey();
  try { await renderProjects(); }
  catch (e) { console.error('[AP3XVER5E] Render failed:', e); }
})();
