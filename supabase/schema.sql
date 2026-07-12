-- schema.sql — miso4dren
-- Gestão de cálculo de redes de drenagem pluvial: import de rede (LandXML) e
-- bacias de contribuição (CSV), dimensionamento de sarjeta crítica e rede de
-- tubos, verificação de conformidade.

create extension if not exists "pgcrypto";

-- Obras (cada obra pertence a um usuário — mesmo padrão de isolamento por
-- user_id usado nos demais apps miso4; não há coluna equivalente no prompt
-- original, mas é necessária para a RLS abaixo)
create table obras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  nome text not null,
  descricao text,
  created_at timestamptz default now()
);

-- Biblioteca de equações IDF (compartilhada entre obras, cada obra escolhe uma)
create table equacoes_idf (
  id uuid primary key default gen_random_uuid(),
  nome text not null,               -- ex: "Itu/SP - DAEE"
  localidade text,
  k double precision not null,
  a double precision not null,
  b double precision not null,
  c double precision not null,
  fonte text,                       -- referência de origem do dado
  created_at timestamptz default now()
);

alter table obras add column equacao_idf_id uuid references equacoes_idf(id);
alter table obras add column tempo_retorno_anos double precision default 10;

-- Caixas de captação e poços de visita (nós do grafo da rede)
create table caixas (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid references obras(id) not null,
  nome text not null,              -- ex: PV-01, BL-03
  tipo text not null,               -- 'pv' | 'boca_de_lobo' | 'caixa_passagem'
  x double precision,
  y double precision,
  cota_terreno double precision,
  cota_fundo double precision,
  origem text default 'landxml',    -- 'landxml' | 'manual'
  created_at timestamptz default now()
);

-- Tabela interna de rugosidade por material (fallback quando o LandXML não traz)
create table materiais_manning (
  id uuid primary key default gen_random_uuid(),
  material text unique not null,
  manning_n double precision not null,
  observacao text
);

-- Trechos de rede (arestas do grafo)
create table trechos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid references obras(id) not null,
  nome text not null,               -- ex: TRECHO-1
  caixa_montante_id uuid references caixas(id) not null,
  caixa_jusante_id uuid references caixas(id) not null,
  comprimento_m double precision not null,
  diametro_m double precision not null,
  declividade_m_m double precision not null,
  material text,                    -- 'CONCRETO' | 'PEAD' | outro, vindo do LandXML
  manning_n double precision,
  manning_n_origem text not null default 'landxml', -- 'landxml' | 'tabela_interna' | 'manual'
  cota_topo_montante double precision,
  cota_fundo_montante double precision,
  cota_topo_jusante double precision,
  cota_fundo_jusante double precision,
  created_at timestamptz default now()
);

-- Bacias de contribuição (importadas do Data Extraction de Catchment)
create table bacias (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid references obras(id) not null,
  nome text not null,
  area_m2 double precision not null,
  coef_c double precision not null,
  tc_min double precision,          -- tempo de concentração próprio, se vier do Civil 3D
  pour_point_x double precision,
  pour_point_y double precision,
  caixa_destino_id uuid references caixas(id),  -- null até o vínculo ser resolvido
  vinculo_status text default 'pendente',        -- 'automatico' | 'manual' | 'pendente'
  created_at timestamptz default now()
);

-- Resultados do módulo sarjeta
create table resultados_sarjeta (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid references obras(id) not null,
  nome_via text not null,
  y0_m double precision not null,          -- altura d'água limite adotada
  z double precision not null,             -- recíproca da declividade transversal
  declividade_longitudinal double precision not null,
  coef_c double precision not null,
  largura_impluvio_m double precision not null,
  manning_n double precision not null,
  intensidade_mm_h double precision not null,
  comprimento_critico_m double precision,  -- resultado
  created_at timestamptz default now()
);

-- Resultados do módulo rede, um registro por trecho calculado
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

-- RLS: cada usuário vê só os dados das próprias obras
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

-- equacoes_idf e materiais_manning são bibliotecas compartilhadas: leitura
-- livre para qualquer usuário autenticado, escrita também (cadastro de novas
-- equações/materiais é uma tela simples, sem dono por registro)
alter table equacoes_idf enable row level security;
alter table materiais_manning enable row level security;

create policy "read all" on equacoes_idf for select using (true);
create policy "write authenticated" on equacoes_idf for all using (auth.role() = 'authenticated');
create policy "read all" on materiais_manning for select using (true);
create policy "write authenticated" on materiais_manning for all using (auth.role() = 'authenticated');
