import { Button } from "@/components/ui/button";

export function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">Taleweaver</h1>
      <Button>はじめる</Button>
    </div>
  );
}
