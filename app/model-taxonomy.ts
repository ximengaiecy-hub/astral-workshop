import type { Model } from "./catalog";

// 模型目录的「阵营 → 种族 / 职业」划分。
// 怪物只按种族筛选；冒险者按种族与职业筛选。规则按顺序匹配，先命中者优先。
export type Party = "monster" | "adventurer" | "other";
export type ModelTaxonomy = { party: Party; race: string; charClass: string };

export const partyNames: Record<Party, string> = { monster: "怪物", adventurer: "冒险者", other: "场景与其他" };
export const OTHER_CLASS = "平民与其他";

type Rule = readonly [label: string, pattern: RegExp];

const UNDEAD = /zombie|vampire|undead|skelet|ghoul|banshee|丧尸|僵尸|亡灵|骷髅|吸血鬼|食尸鬼|女妖/i;
const ANIMAL_COMPANION = /猎鹰|\bfalcon\b/i;
// 可作为玩家角色的种族；其余类人（地精、狗头人、兽人等）归入怪物。
const PLAYABLE_TYPES = new Set(["矮人", "矮人骑兵", "卓尔精灵"]);

const adventurerRaces: readonly Rule[] = [
  ["卓尔精灵", /卓尔|drow/i],
  ["半身人", /半身人|halfling/i],
  ["侏儒", /侏儒|gnome/i],
  ["半人马", /半人马|centaur/i],
  ["狗头人", /狗头人|kobold/i],
  ["精灵", /精灵|\bel(?:f|ves)\b|elven/i],
  ["矮人", /矮人|dwarf|dwarves|duergar/i],
];

// 职业按 D&D 5e 习惯排列，用于筛选按钮顺序；匹配顺序见 classMatchOrder。
export const classOrder = ["野蛮人", "吟游诗人", "牧师", "德鲁伊", "战士", "武僧", "圣武士", "游侠", "游荡者", "术士", "邪术师", "法师", "奇械师", "灵能者", "枪手", "炼金术师", "咒猎者", "先锋", "武士", "忍者", "女巫", "战法师", OTHER_CLASS];
const classMatchOrder: readonly Rule[] = [
  ["邪术师", /邪术师|warlock|blood pact/i],
  ["术士", /术士|sorcerer|socerer|haemomancer|lavashaper|elemental magic/i],
  ["法师", /法师|wizard|\bmage\b|summoner|runemaster|necromancer|死灵|arachnomancer|spidermancer|chronicler/i],
  ["牧师", /牧师|祭司|cleric|priest/i],
  ["德鲁伊", /德鲁伊|druid/i],
  ["圣武士", /圣武士|paladin|knight-faith|holy hunter|crusader/i],
  ["吟游诗人", /吟游诗人|\bbard\b/i],
  ["武僧", /武僧|monk|pugilist|brawler/i],
  ["野蛮人", /野蛮人|蛮族|狂战士|barbarian|berserker|berzerker|battlerager/i],
  ["游侠", /游侠|猎人|弓手|ranger|hunter|huntress|archer|marksman|pathfinder|trapper|sureshot|crossbow|arbalist/i],
  ["游荡者", /游荡者|盗贼|刺客|rogue|assassin|thief|bandit|gangster/i],
  ["奇械师", /奇械师|修补匠|artificer|engineer|inventor|mechanist|tinker|grenadier|cannon|alchemist|potioneer/i],
  ["战士", /战士|士兵|老兵|佣兵|卫兵|armou?red|guardians?|chosens?|immortal|siege|trebuchet|fighter|warrior|soldier|guard|veteran|mercenary|knight|axeman|infantry|regiment|general|captain|commander|war maiden|champion|gunslinger|gunner|musketeer|arquebus|spear|halberd|sword|axe|hammer|mace|flail|morningstar|lancer|raider|war chief|slayer|bannerman|standard bearer|gatling|\bgun|juggern/i],
];

const monsterTypeAliases: Record<string, string> = { 观察者眼魔: "眼魔" };
const monsterRaces: readonly Rule[] = [
  ["龙", /龙|dragon|提亚马特|巴哈姆特/i],
  ["兽人", /兽人|\borcs?\b/i],
  ["大地精", /大地精|hobgoblin/i],
  ["熊地精", /熊地精|bugbear/i],
  ["地精", /地精|goblin/i],
  ["狗头人", /狗头人|kobold/i],
  ["人类", /强盗|邪教徒|卫兵|盗匪|劫掠者|bandit|cultist|guard/i],
  ["变形怪", /变形怪|拟形怪|doppelganger|mimic/i],
  ["兽化人", /鼠人|wererat|lycan/i],
  ["蕈人与真菌", /蕈|孢子|myconid/i],
  ["枯萎怪", /枯萎怪|blight/i],
  ["元素", /火蛇|隐形追猎者|元素|elemental|invisible stalker/i],
  ["巨人", /食人魔|ogre|巨人/i],
  ["畸变体", /格里克|grick|独眼怪|nothic|观者|spectator/i],
  ["奇异生物", /鸟妖|harpy|螳怪|赭冻怪|蝎尾狮|腐食虫|manticore|ooze|carrion/i],
  ["眼魔", /beholder|眼魔/i],
  ["枭熊", /owlbear|枭熊|袅熊/i],
  ["恶魔与魔鬼", /demon|devil|恶魔|魔鬼/i],
  ["野兽", /熊|bear|spider|scorpion|snake|蝎|蜘蛛|狼|野猪|巨猪|马|牛|蟹|鲨|巨鼠|蚊蝠|stirge|猎鹰|蛇|wolf|boar|horse|rat\b/i],
];
const undeadRaces: readonly Rule[] = [
  ["丧尸", /丧尸|僵尸|zombie/i],
  ["骷髅", /骷髅|skelet/i],
  ["幽灵", /幽灵|怨灵|女妖|wraith|ghost|banshee/i],
];

function firstMatch(rules: readonly Rule[], text: string) {
  return rules.find(([, pattern]) => pattern.test(text))?.[0];
}

export function classifyModel(model: Pick<Model, "name" | "officialName" | "category" | "creatureType" | "modelKind" | "quoteOnly" | "searchAliases" | "taxonomy">): ModelTaxonomy {
  if(model.taxonomy)return model.taxonomy;
  const text = `${model.name} ${model.officialName || ""} ${(model.searchAliases || []).join(" ")}`;
  if(model.modelKind && model.modelKind !== "棋子")return {party:"other",race:model.modelKind,charClass:""};
  if(model.quoteOnly && model.category === "待分类") {
    if(/dragon|beholder|owlbear|goblin|kobold|skelet|zombie|demon|devil|monster|spider|ghost|wolf|troll|ogre|giant|hydra|兽人|地精|怪物/i.test(text))model={...model,category:"怪物"};
    else if(/dwarf|dwarves|elf|elven|drow|human|halfling|gnome|cleric|wizard|warrior|paladin|ranger|rogue|barbarian|sorcerer|bard|monk|knight|fighter|artificer|npc/i.test(text))model={...model,category:"冒险者"};
    else return {party:"other",race:"种族未标注",charClass:""};
  }
  const type = model.creatureType?.trim() || "";
  const isDwarf = type === "矮人" || type === "矮人骑兵";
  const undead = UNDEAD.test(text) || ["骷髅", "丧尸", "幽灵"].includes(type);
  const adventurer = !ANIMAL_COMPANION.test(text) && !(undead && model.category !== "冒险者")
    && (model.category === "冒险者" || model.category === "NPC" || (PLAYABLE_TYPES.has(type) && model.category !== "怪物"));

  if (adventurer) {
    const race = isDwarf ? "矮人" : type || firstMatch(adventurerRaces, text) || (model.quoteOnly ? "种族未标注" : "人类");
    return { party: "adventurer", race, charClass: firstMatch(classMatchOrder, text) || OTHER_CLASS };
  }
  if (undead) return { party: "monster", race: (type && !isDwarf ? type : firstMatch(undeadRaces, text)) || "亡灵", charClass: "" };
  // 鬼火、焰颅之类没有标注类型的不死生物
  if (/鬼火|焰颅|flameskull|will-o/i.test(text)) return { party: "monster", race: "亡灵", charClass: "" };
  const race = (type && !isDwarf ? monsterTypeAliases[type] || type : "") || firstMatch(monsterRaces, text) || (model.category === "巨龙" ? "龙" : "其他怪物");
  return { party: "monster", race, charClass: "" };
}

export function taxonomyLabel(taxonomy: ModelTaxonomy) {
  return taxonomy.party === "adventurer" && taxonomy.charClass !== OTHER_CLASS ? `${taxonomy.race} · ${taxonomy.charClass}` : taxonomy.race;
}
