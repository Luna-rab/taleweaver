import { Link } from "react-router";

export function Header() {
  return (
    <header className="border-b px-6 py-3">
      <Link to="/" className="font-semibold">
        Taleweaver
      </Link>
    </header>
  );
}
