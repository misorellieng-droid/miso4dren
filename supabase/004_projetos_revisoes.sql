-- 004_projetos_revisoes.sql — miso4dren
-- Introduz Cliente > Projeto > Revisão como hierarquia de organização.
-- Um projeto pode ter várias revisões (ex.: "Rev. 0 — tubo concreto",
-- "Rev. 1 — tubo PEAD"), e os estudos de sarjeta crítica, bacias e rede
-- passam a ficar vinculados à revisão (não mais diretamente a uma "obra"
-- solta) — cada revisão é seu próprio memorial de cálculo completo,
-- revisitável e editável.
--
-- "obras" vira "revisoes" e ganha um projeto_id. Os filhos (caixas, trechos,
-- bacias, resultados_sarjeta) trocam obra_id por revisao_id.

create table clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  documento text,
  email text,
  telefone text,
  created_at timestamptz default now()
);

create table projetos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id),
  nome text not null,
  descricao text,
  created_at timestamptz default now()
);

alter table obras rename to revisoes;
alter table revisoes add column projeto_id uuid references projetos(id);
-- revisões existentes (criadas antes desta migração, ex. dados de teste)
-- ficam sem projeto até serem reatribuídas manualmente ou removidas.

alter table caixas rename column obra_id to revisao_id;
alter table trechos rename column obra_id to revisao_id;
alter table bacias rename column obra_id to revisao_id;
alter table resultados_sarjeta rename column obra_id to revisao_id;

alter table clientes enable row level security;
alter table projetos enable row level security;

-- mesmo modo "sem login" já adotado no resto do app (ver 002_modo_sem_login.sql)
create policy "acesso aberto (sem login)" on clientes for all using (true) with check (true);
create policy "acesso aberto (sem login)" on projetos for all using (true) with check (true);
