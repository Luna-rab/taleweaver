import { Outlet } from "react-router";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Footer } from "./footer";
import { Header } from "./header";

export function Layout() {
  return (
    <div className="flex h-svh flex-col">
      <Header />
      {/* min-h-0 がないと、中身が長いときに ScrollArea が縮まず、ページ全体が伸びてブラウザのスクロールバーが出る */}
      <ScrollArea className="min-h-0 flex-1">
        {/* 中身が短いルートでも flex-1 で残りの高さを埋められるように、表示領域と同じ高さを最低限確保する */}
        <main className="flex min-h-full flex-col">
          <Outlet />
        </main>
      </ScrollArea>
      <Footer />
    </div>
  );
}
