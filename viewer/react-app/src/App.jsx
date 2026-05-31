import { useState } from 'react';
import { Roadmap } from './components/Roadmap';

import derivedDisplayByLineup from './data/derived-display-by-lineup.json';
import derivedDisplay from './data/derived-display-full-view.json';
import recipeSemiFull from './data/recipe-semi-full.json';
import recipeSemiExec from './data/recipe-semi-exec.json';
import recipeSemi1Y from './data/recipe-semi-1y.json';
import derivedMemoryFull from './data/derived-memory-full-view.json';
import derivedMemoryExec from './data/derived-memory-exec-view.json';
import derivedLogic from './data/derived-logic-full-view.json';

const EXAMPLES = {
  // multi-row mode: lane = lineup (PG4), 각 row = product
  displayByLineup: { label: 'Display · by Lineup (multi-row)', recipe: derivedDisplayByLineup },
  // single-row mode: lane = product
  display:         { label: 'Display · by Product (single-row)', recipe: derivedDisplay },
  // 직접 작성된 recipe들
  semiFull: { label: 'Semi · Full (10Y)',         recipe: recipeSemiFull },
  semi1Y:   { label: 'Semi · 1Y Validation',      recipe: recipeSemi1Y },
  semiExec: { label: 'Semi · Executive (5Y)',     recipe: recipeSemiExec },
  // v2 DB → Recipe 변환 결과
  dbMemoryFull: { label: 'DB→ Memory Full (v2)',  recipe: derivedMemoryFull },
  dbMemoryExec: { label: 'DB→ Memory Exec (v2)',  recipe: derivedMemoryExec },
  dbLogic:      { label: 'DB→ Logic (v2)',        recipe: derivedLogic },
};

export default function App() {
  const [exampleKey, setExampleKey] = useState('displayByLineup');
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftJson, setDraftJson] = useState('');
  const [customRecipe, setCustomRecipe] = useState(null);
  const [error, setError] = useState('');

  const activeRecipe = customRecipe || EXAMPLES[exampleKey].recipe;

  const handleApply = () => {
    try {
      const parsed = JSON.parse(draftJson);
      if (!parsed.timeRange?.start || !parsed.timeRange?.end || !Array.isArray(parsed.lanes)) {
        throw new Error('필수 필드 누락: timeRange.start, timeRange.end, lanes 배열');
      }
      setCustomRecipe(parsed);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setDraftJson(ev.target.result);
      setEditorOpen(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleReset = () => {
    setCustomRecipe(null);
    setDraftJson('');
    setError('');
  };

  const handleLoadCurrent = () => {
    setDraftJson(JSON.stringify(activeRecipe, null, 2));
    setEditorOpen(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 font-sans">
      <div className="w-full mx-auto">
        {/* Example switcher + editor toggle */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap items-center gap-2 text-sm mb-4">
          <span className="font-medium text-slate-600 mr-1">예제:</span>
          {Object.entries(EXAMPLES).map(([k, v]) => (
            <button
              key={k}
              onClick={() => { setExampleKey(k); setCustomRecipe(null); }}
              className={`px-3 py-1 rounded-md transition border ${
                !customRecipe && exampleKey === k
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
            >
              {v.label}
            </button>
          ))}
          {customRecipe && (
            <span className="px-3 py-1 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 font-medium">
              Custom JSON
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={handleLoadCurrent}
            className="px-3 py-1 rounded-md bg-white text-slate-600 border border-slate-200 hover:border-slate-400 transition"
          >
            현재 데이터 편집
          </button>
          <label className="px-3 py-1 rounded-md bg-white text-slate-600 border border-slate-200 hover:border-slate-400 transition cursor-pointer">
            파일 업로드
            <input type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
          </label>
          <button
            onClick={() => setEditorOpen(o => !o)}
            className="px-3 py-1 rounded-md bg-slate-800 text-white hover:bg-slate-700 transition"
          >
            {editorOpen ? '에디터 숨기기' : 'JSON 직접 입력'}
          </button>
        </div>

        {/* JSON editor */}
        {editorOpen && (
          <div className="mb-4 bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">Recipe JSON</span>
              <div className="flex gap-2">
                <button
                  onClick={handleReset}
                  className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200"
                >
                  Reset
                </button>
                <button
                  onClick={handleApply}
                  className="text-xs px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Apply
                </button>
              </div>
            </div>
            <textarea
              value={draftJson}
              onChange={(e) => setDraftJson(e.target.value)}
              placeholder='Recipe JSON을 붙여넣으세요.'
              className="w-full h-72 font-mono text-xs p-3 rounded-md border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
              spellCheck={false}
            />
            {error && (
              <div className="mt-2 text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                ⚠ {error}
              </div>
            )}
          </div>
        )}

        <Roadmap recipe={activeRecipe} />
      </div>
    </div>
  );
}
