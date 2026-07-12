-- 000_run_this_once.sql — miso4dren
-- Cole este arquivo inteiro no SQL Editor do projeto Supabase (nnqauixcsmvrhypxrbpi)
-- e rode uma vez. Combina schema.sql + 001_seed.sql para facilitar o setup inicial.

-- ============================================================
-- schema.sql
-- ============================================================

create extension if not exists "pgcrypto";

create table obras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  nome text not null,
  descricao text,
  created_at timestamptz default now()
);

create table equacoes_idf (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  localidade text,
  k double precision not null,
  a double precision not null,
  b double precision not null,
  c double precision not null,
  fonte text,
  created_at timestamptz default now()
);

alter table obras add column equacao_idf_id uuid references equacoes_idf(id);
alter table obras add column tempo_retorno_anos double precision default 10;

create table caixas (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid references obras(id) not null,
  nome text not null,
  tipo text not null,
  x double precision,
  y double precision,
  cota_terreno double precision,
  cota_fundo double precision,
  origem text default 'landxml',
  created_at timestamptz default now()
);

create table materiais_manning (
  id uuid primary key default gen_random_uuid(),
  material text unique not null,
  manning_n double precision not null,
  observacao text
);

create table trechos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid references obras(id) not null,
  nome text not null,
  caixa_montante_id uuid references caixas(id) not null,
  caixa_jusante_id uuid references caixas(id) not null,
  comprimento_m double precision not null,
  diametro_m double precision not null,
  declividade_m_m double precision not null,
  material text,
  manning_n double precision,
  manning_n_origem text not null default 'landxml',
  cota_topo_montante double precision,
  cota_fundo_montante double precision,
  cota_topo_jusante double precision,
  cota_fundo_jusante double precision,
  created_at timestamptz default now()
);

create table bacias (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid references obras(id) not null,
  nome text not null,
  area_m2 double precision not null,
  coef_c double precision not null,
  tc_min double precision,
  pour_point_x double precision,
  pour_point_y double precision,
  caixa_destino_id uuid references caixas(id),
  vinculo_status text default 'pendente',
  created_at timestamptz default now()
);

create table resultados_sarjeta (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid references obras(id) not null,
  nome_via text not null,
  y0_m double precision not null,
  z double precision not null,
  declividade_longitudinal double precision not null,
  coef_c double precision not null,
  largura_impluvio_m double precision not null,
  manning_n double precision not null,
  intensidade_mm_h double precision not null,
  comprimento_critico_m double precision,
  created_at timestamptz default now()
);

create table resultados_rede (
  id uuid primary key default gen_random_uuid(),
  trecho_id uuid references trechos(id) not null,
  q_entrada_m3s double precision,
  q_projeto_m3s double precision,
  tc_sistema_min double precision,
  intensidade_mm_h double precision,
  lamina_m double precision,
  y_sobre_d_pct double precision,
  raio_hidraulico_m double precision,
  velocidade_ms double precision,
  vazao_calculada_m3s double precision,
  conforme boolean,
  motivo_nao_conformidade text,
  created_at timestamptz default now()
);

alter table obras enable row level security;
alter table caixas enable row level security;
alter table trechos enable row level security;
alter table bacias enable row level security;
alter table resultados_sarjeta enable row level security;
alter table resultados_rede enable row level security;

create policy "own data" on obras
  using (auth.uid() = user_id);
create policy "own data" on caixas
  using (obra_id in (select id from obras where user_id = auth.uid()));
create policy "own data" on trechos
  using (obra_id in (select id from obras where user_id = auth.uid()));
create policy "own data" on bacias
  using (obra_id in (select id from obras where user_id = auth.uid()));
create policy "own data" on resultados_sarjeta
  using (obra_id in (select id from obras where user_id = auth.uid()));
create policy "own data" on resultados_rede
  using (trecho_id in (
    select id from trechos where obra_id in (
      select id from obras where user_id = auth.uid()
    )
  ));

alter table equacoes_idf enable row level security;
alter table materiais_manning enable row level security;

create policy "read all" on equacoes_idf for select using (true);
create policy "write authenticated" on equacoes_idf for all using (auth.role() = 'authenticated');
create policy "read all" on materiais_manning for select using (true);
create policy "write authenticated" on materiais_manning for all using (auth.role() = 'authenticated');

-- ============================================================
-- 001_seed.sql
-- ============================================================

insert into materiais_manning (material, manning_n, observacao) values
  ('CONCRETO', 0.013, 'Manual de Hidrologia DNIT'),
  ('PEAD', 0.010, 'PEAD corrugado parede dupla, interna lisa — DNIT-094/2014-EM e fabricantes (Kanaflex, ADS Tigre, Cimflex)');

insert into equacoes_idf (nome, localidade, k, a, b, c, fonte) values
  ('Equação de referência do usuário', 'a confirmar', 4003.518, 0.203, 49.996, 0.931, 'Planilha_DrenagemLimpa.xlsm');
