"use client";

import { partyNames, type Party } from "./model-taxonomy";

export type FacetOption = { value: string; count: number };

type Props = {
  party: "" | Party;
  race: string;
  charClass: string;
  partyCounts: Record<"" | Party, number>;
  raceOptions: FacetOption[];
  classOptions: FacetOption[];
  onParty: (party: "" | Party) => void;
  onRace: (race: string) => void;
  onClass: (charClass: string) => void;
};

const parties: ("" | Party)[] = ["", "monster", "adventurer", "other"];
const partyHints: Record<"" | Party, string> = { "": "全部模型", monster: "按种族挑选", adventurer: "按种族与职业挑选", other:"套组、胸像、地形与待分类" };

function Chip({ label, count, selected, onClick }: { label: string; count: number; selected: boolean; onClick: () => void }) {
  return <button type="button" className={`race-chip ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={onClick} disabled={!selected && count === 0}>
    <span>{label}</span><small>{count}</small>
  </button>;
}

// 模型目录的阵营 / 种族 / 职业筛选。怪物只展示种族，冒险者同时展示种族与职业。
export default function RaceFilter({ party, race, charClass, partyCounts, raceOptions, classOptions, onParty, onRace, onClass }: Props) {
  return <div className="race-filter" role="group" aria-label="按种族与职业筛选">
    <div className="race-filter-party" role="group" aria-label="选择阵营">
      {parties.map(value => <button key={value || "all"} type="button" className={`party-tab party-${value || "all"} ${party === value ? "selected" : ""}`} aria-pressed={party === value} onClick={() => onParty(value)}>
        <strong>{value ? partyNames[value] : "全部"}</strong>
        <span>{partyHints[value]} · {partyCounts[value]}</span>
      </button>)}
    </div>
    {party && <div className="race-filter-row">
      <span className="race-filter-label" id="race-filter-label">{party === "other" ? "类型" : "种族"}</span>
      <div className="race-chip-list" role="group" aria-labelledby="race-filter-label">
        <Chip label={party === "other" ? "全部类型" : "全部种族"} count={raceOptions.reduce((sum, option) => sum + option.count, 0)} selected={!race} onClick={() => onRace("")} />
        {raceOptions.map(option => <Chip key={option.value} label={option.value} count={option.count} selected={race === option.value} onClick={() => onRace(race === option.value ? "" : option.value)} />)}
      </div>
    </div>}
    {party === "adventurer" && <div className="race-filter-row">
      <span className="race-filter-label" id="class-filter-label">职业</span>
      <div className="race-chip-list" role="group" aria-labelledby="class-filter-label">
        <Chip label="全部职业" count={classOptions.reduce((sum, option) => sum + option.count, 0)} selected={!charClass} onClick={() => onClass("")} />
        {classOptions.map(option => <Chip key={option.value} label={option.value} count={option.count} selected={charClass === option.value} onClick={() => onClass(charClass === option.value ? "" : option.value)} />)}
      </div>
    </div>}
  </div>;
}
