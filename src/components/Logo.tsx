import Image from "next/image";

const HEIGHT = { sm: 28, lg: 40 } as const;
/** ロゴ画像（public/logo-horizontal.png）の実際の縦横比。 */
const ASPECT_RATIO = 940 / 198;

export default function Logo({ size = "sm" }: { size?: "sm" | "lg" }) {
  const height = HEIGHT[size];
  const width = Math.round(height * ASPECT_RATIO);
  return (
    <span className="flex items-center gap-2">
      <Image src="/logo-horizontal.png" alt="on call" width={width} height={height} priority />
      <span
        className="font-medium text-foreground/50"
        style={{ fontSize: size === "lg" ? "1.1rem" : "0.9rem" }}
      >
        Leads
      </span>
    </span>
  );
}
