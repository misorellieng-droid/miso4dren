-- Bucket público pro logotipo da empresa (tela Configurações → relatório completo do projeto).
-- Guardado sempre no mesmo path fixo ("logo") dentro do bucket -- upload novo sobrescreve o
-- anterior (upsert), sem precisar de tabela nova pra registrar isso. Mesmo modo "sem login"
-- (acesso aberto) já adotado no resto do app -- ver 002_modo_sem_login.sql.

insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do nothing;

create policy "acesso aberto ao bucket assets (sem login)" on storage.objects
  for all using (bucket_id = 'assets') with check (bucket_id = 'assets');
