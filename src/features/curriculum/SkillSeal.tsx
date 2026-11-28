import { skillSymbol } from "./skill-symbols";
import "./skill-seal.css";

// The round Practice-tree badge for a skill.
export function SkillSeal({
  unitId,
  className,
}: {
  readonly unitId: string;
  readonly className?: string;
}) {
  return (
    <span
      className={className ? `skill-seal ${className}` : "skill-seal"}
      aria-hidden="true"
    >
      {skillSymbol(unitId)}
    </span>
  );
}
