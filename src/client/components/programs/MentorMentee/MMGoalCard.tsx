import { cn } from "@/shared/utils";

interface MMGoalCarProps {
  text: string;
  cardColor: "blue" | "green";
}

export const MMGoalCard = ({ cardColor, text }: MMGoalCarProps) => {
  return (
    <div
      className={cn(
        {
          "bg-saseGreen shadow-[0_25px_4px_rgba(125,194,66,0.5)]": cardColor == "green",
          "bg-saseBlue shadow-[0_25px_4px_rgba(6,104,79,0.5)]": cardColor == "blue",
        },
        `relative flex h-[350px] w-[350px] items-center justify-center rounded-full`,
      )}
    >
      <p className="w-full p-6 text-center font-redhat text-2xl text-white">{text}</p>
    </div>
  );
};
