import type { Team } from "./types";

export const TEAM_META: Record<Team, { label: string; tone: string; chip: string }> = {
  factory: { label: "Pabrik", tone: "text-forest-700", chip: "bg-forest-100 text-forest-700" },
  farm: { label: "Kebun", tone: "text-olive", chip: "bg-[#e9f0d8] text-olive" },
  sales: { label: "Sales", tone: "text-sky", chip: "bg-sky-soft text-[#2c5775]" },
  office: { label: "Kantor", tone: "text-[#8a6512]", chip: "bg-gold-soft text-[#8a6512]" },
};

export const TEAMS: Team[] = ["factory", "farm", "sales", "office"];
