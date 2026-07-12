-- 002_modo_sem_login.sql — miso4dren
-- Libera leitura/escrita sem autenticação enquanto não há tela de login.
-- PENDÊNCIA DE SEGURANÇA: qualquer pessoa com a URL + anon key consegue ler
-- e escrever nas tabelas. Aceitável enquanto for uso pessoal/único usuário
-- (mesmo padrão adotado em miso4slope/supabase/002_modo_sem_login.sql).
-- Reverter para RLS por auth.uid() assim que o login for implementado
-- (as políticas originais, comentadas, estão no fim deste arquivo).

alter table obras alter column user_id drop not null;

drop policy if exists "own data" on obras;
drop policy if exists "own data" on caixas;
drop policy if exists "own data" on trechos;
drop policy if exists "own data" on bacias;
drop policy if exists "own data" on resultados_sarjeta;
drop policy if exists "own data" on resultados_rede;

create policy "acesso aberto (sem login)" on obras for all using (true) with check (true);
create policy "acesso aberto (sem login)" on caixas for all using (true) with check (true);
create policy "acesso aberto (sem login)" on trechos for all using (true) with check (true);
create policy "acesso aberto (sem login)" on bacias for all using (true) with check (true);
create policy "acesso aberto (sem login)" on resultados_sarjeta for all using (true) with check (true);
create policy "acesso aberto (sem login)" on resultados_rede for all using (true) with check (true);

-- Políticas originais (por usuário), para restaurar quando houver login:
--
-- drop policy "acesso aberto (sem login)" on obras;
-- drop policy "acesso aberto (sem login)" on caixas;
-- drop policy "acesso aberto (sem login)" on trechos;
-- drop policy "acesso aberto (sem login)" on bacias;
-- drop policy "acesso aberto (sem login)" on resultados_sarjeta;
-- drop policy "acesso aberto (sem login)" on resultados_rede;
-- alter table obras alter column user_id set not null;
--
-- create policy "own data" on obras
--   using (auth.uid() = user_id);
-- create policy "own data" on caixas
--   using (obra_id in (select id from obras where user_id = auth.uid()));
-- create policy "own data" on trechos
--   using (obra_id in (select id from obras where user_id = auth.uid()));
-- create policy "own data" on bacias
--   using (obra_id in (select id from obras where user_id = auth.uid()));
-- create policy "own data" on resultados_sarjeta
--   using (obra_id in (select id from obras where user_id = auth.uid()));
-- create policy "own data" on resultados_rede
--   using (trecho_id in (
--     select id from trechos where obra_id in (
--       select id from obras where user_id = auth.uid()
--     )
--   ));
