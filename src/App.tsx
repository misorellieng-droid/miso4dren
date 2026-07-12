import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { ObrasPage } from './pages/ObrasPage'
import { BaciasPage } from './pages/BaciasPage'
import { SarjetaCriticaPage } from './pages/SarjetaCriticaPage'
import { RedePluvialPage } from './pages/RedePluvialPage'
import { ConformidadePage } from './pages/ConformidadePage'
import { RelatoriosPage } from './pages/RelatoriosPage'
import { EquacoesIdfPage } from './pages/EquacoesIdfPage'
import { MateriaisPage } from './pages/MateriaisPage'
import { PlaceholderPage } from './pages/PlaceholderPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="obras" element={<ObrasPage />} />
        <Route path="bacias" element={<BaciasPage />} />
        <Route path="sarjeta-critica" element={<SarjetaCriticaPage />} />
        <Route path="rede-pluvial" element={<RedePluvialPage />} />
        <Route path="conformidade" element={<ConformidadePage />} />
        <Route path="relatorios" element={<RelatoriosPage />} />
        <Route path="equacoes-idf" element={<EquacoesIdfPage />} />
        <Route path="materiais" element={<MateriaisPage />} />
        <Route path="manual" element={<PlaceholderPage title="Manual / Ajuda" />} />
      </Route>
    </Routes>
  )
}
