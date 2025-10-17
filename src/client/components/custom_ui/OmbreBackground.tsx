interface OmbreBackgroundProps {
  innerComponent: React.ReactNode;
}

export const OmbreBackground: React.FC<OmbreBackgroundProps> = ({ innerComponent }) => {
  return (
    <>
      <div className="relative h-full w-full rounded-2xl bg-gradient-to-r from-saseBlue to-saseGreen p-[4px]">{innerComponent}</div>
    </>
  );
};
