-- 008_sarjetao_dente_serra.sql — miso4dren
-- Novo módulo "sarjetão em dente de serra": via sem declividade longitudinal
-- (pátio nivelado entre galpões), desnível dado só pela variação da
-- declividade transversal do sarjetão. Diferente do modo_declividade =
-- 'desnivel_fixo' já existente em resultados_sarjeta (fórmula fechada, um
-- único método de capacidade): este módulo resolve por bisseção com
-- iteração de Tc, e compara DOIS métodos de capacidade lado a lado (Manning
-- genérico retangular vs. HEC-22/FHWA triangular integrado) — daí a tabela
-- própria em vez de mais colunas em resultados_sarjeta, que já acumulou
-- bastante coisa obsoleta/nula entre as três geometrias anteriores.

create table resultados_sarjetao_dente_serra (
  id uuid primary key default gen_random_uuid(),
  revisao_id uuid not null references revisoes(id),
  nome_trecho text not null,

  -- geometria da via / bacia contribuinte
  largura_via_m double precision not null,
  coef_c double precision not null,
  telhado_ativo boolean not null default false,
  largura_telhado_m double precision,
  coef_c_telhado double precision,

  -- geometria do sarjetão (dente de serra)
  largura_sarjetao_m double precision not null,
  sx_sarjetao_alto_m_m double precision not null,
  sx_sarjetao_baixo_m_m double precision not null,

  -- hidráulica de projeto
  lamina_max_m double precision not null,
  sx_pista_m_m double precision not null,
  espraiamento_m double precision not null,
  espraiamento_editado boolean not null default false,
  manning_n double precision not null,

  -- IDF / tempo de concentração
  tempo_retorno_anos double precision not null,
  tc_inicial_min double precision not null,

  -- resultado geométrico compartilhado
  delta_h_m double precision not null,

  -- Método 1 — Manning genérico, seção retangular equivalente
  m1_comprimento_m double precision not null,
  m1_iteracoes integer not null,
  m1_convergiu boolean not null,
  m1_iteracoes_tc integer not null,
  m1_convergiu_tc boolean not null,
  m1_lamina_critica_m double precision not null,
  m1_velocidade_ms double precision not null,
  m1_vazao_m3s double precision not null,
  m1_declividade_longitudinal_m_m double precision not null,
  m1_tc_convergido_min double precision not null,
  m1_intensidade_mm_h double precision not null,

  -- Método 2 — HEC-22/FHWA, seção triangular integrada
  m2_comprimento_m double precision not null,
  m2_iteracoes integer not null,
  m2_convergiu boolean not null,
  m2_iteracoes_tc integer not null,
  m2_convergiu_tc boolean not null,
  m2_lamina_critica_m double precision not null,
  m2_velocidade_ms double precision not null,
  m2_vazao_m3s double precision not null,
  m2_declividade_longitudinal_m_m double precision not null,
  m2_tc_convergido_min double precision not null,
  m2_intensidade_mm_h double precision not null,

  -- comparação
  diferenca_percentual double precision not null,
  comprimento_recomendado_m double precision not null,
  metodo_recomendado text not null,

  created_at timestamptz default now()
);

comment on column resultados_sarjetao_dente_serra.sx_pista_m_m is 'Declividade transversal da via FORA do sarjetão — usada só no Método 2 (HEC-22) e no espraiamento automático. Não confundir com sx_sarjetao_alto_m_m/sx_sarjetao_baixo_m_m, que são do próprio sarjetão.';
comment on column resultados_sarjetao_dente_serra.metodo_recomendado is '''manning_generico'' | ''hec22'' — o de menor comprimento (lado da segurança).';

alter table resultados_sarjetao_dente_serra enable row level security;

-- mesmo modo "sem login" adotado no resto do app (ver 002_modo_sem_login.sql)
create policy "acesso aberto (sem login)" on resultados_sarjetao_dente_serra for all using (true) with check (true);
