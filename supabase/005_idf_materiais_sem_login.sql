-- 005_idf_materiais_sem_login.sql — miso4dren
-- equacoes_idf e materiais_manning ficaram de fora do "modo sem login"
-- aplicado em 002_modo_sem_login.sql (obras/revisoes) e 004_projetos_revisoes.sql
-- (clientes/projetos) — a política "write authenticated" bloqueia qualquer
-- insert/update/delete sem sessão (401), então criar/editar equação IDF ou
-- material nunca funcionou pelo app. Mesmo tratamento: acesso aberto por
-- enquanto, reverter quando o login existir.

drop policy if exists "write authenticated" on equacoes_idf;
drop policy if exists "write authenticated" on materiais_manning;

create policy "acesso aberto (sem login)" on equacoes_idf for all using (true) with check (true);
create policy "acesso aberto (sem login)" on materiais_manning for all using (true) with check (true);
