import { Route, Routes } from "react-router-dom";
import { Layout } from "../components/layout/Layout";
import { AProposPage } from "../pages/APropos";
import { HomePage } from "../pages/Home";
import { NotFoundPage } from "../pages/NotFound";
import { SimulateurPage } from "../pages/Simulateur";
import { WorkspacePage } from "../pages/Workspace";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/simulateur" element={<SimulateurPage />} />
        <Route path="/simulateur/cube" element={<WorkspacePage puzzle="cube" />} />
        <Route path="/simulateur/pyraminx" element={<WorkspacePage puzzle="pyraminx" />} />
        <Route path="/a-propos" element={<AProposPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
