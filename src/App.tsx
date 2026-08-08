import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { ClientesPage } from './pages/ClientesPage'
import { ProjetosPage } from './pages/ProjetosPage'
import { ProjetoDetailPage } from './pages/ProjetoDetailPage'
import { BaciasPage } from './pages/BaciasPage'
import { RedeImportadaPage } from './pages/RedeImportadaPage'
import { SarjetaCriticaPage } from './pages/SarjetaCriticaPage'
import { SarjetaoDenteServaPage } from './pages/SarjetaoDenteServaPage'
import { RedePluvialPage } from './pages/RedePluvialPage'
import { EscadasHidraulicasPage } from './pages/EscadasHidraulicasPage'
import { ConformidadePage } from './pages/ConformidadePage'
import { RelatoriosPage } from './pages/RelatoriosPage'
import { EquacoesIdfPage } from './pages/EquacoesIdfPage'
import { MateriaisPage } from './pages/MateriaisPage'
import { BibliotecaPecasPage } from './pages/BibliotecaPecasPage'
import { ArquivoPage } from './pages/ArquivoPage'
import { PlaceholderPage } from './pages/PlaceholderPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="clientes" element={<ClientesPage />} />
        <Route path="projetos" element={<ProjetosPage />} />
        <Route path="projetos/:id" element={<ProjetoDetailPage />} />
        <Route path="bacias" element={<BaciasPage />} />
        <Route path="rede-importada" element={<RedeImportadaPage />} />
        <Route path="sarjeta-critica" element={<SarjetaCriticaPage />} />
        <Route path="sarjetao-dente-serra" element={<SarjetaoDenteServaPage />} />
        <Route path="rede-pluvial" element={<RedePluvialPage />} />
        <Route path="escadas-hidraulicas" element={<EscadasHidraulicasPage />} />
        <Route path="conformidade" element={<ConformidadePage />} />
        <Route path="relatorios" element={<RelatoriosPage />} />
        <Route path="equacoes-idf" element={<EquacoesIdfPage />} />
        <Route path="materiais" element={<MateriaisPage />} />
        <Route path="biblioteca-pecas" element={<BibliotecaPecasPage />} />
        <Route path="arquivo" element={<ArquivoPage />} />
        <Route path="manual" element={<PlaceholderPage title="Manual / Ajuda" />} />
      </Route>
    </Routes>
  )
}
