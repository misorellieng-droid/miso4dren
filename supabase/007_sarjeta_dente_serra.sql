-- 007_sarjeta_dente_serra.sql — miso4dren
-- Terceiro modo de declividade longitudinal: "dente de serra" por
-- declividade transversal variável (via sem declividade longitudinal E sem
-- inclinação de fundo na calha — o desnível vem de variar a própria
-- declividade transversal do sarjetão ao longo do comprimento).
--
-- declividade_calculada_por_velocidade (booleano, de 006) vira um caso
-- particular de modo_declividade — mantido por compatibilidade, mas
-- modo_declividade é a fonte de verdade a partir de agora.

alter table resultados_sarjeta add column if not exists modo_declividade text not null default 'informada';
alter table resultados_sarjeta add column if not exists desnivel_m double precision;
alter table resultados_sarjeta add column if not exists declividade_transversal_min_m_m double precision;

comment on column resultados_sarjeta.modo_declividade is '''informada'' | ''velocidade_minima'' | ''desnivel_fixo''.';
comment on column resultados_sarjeta.desnivel_m is 'Diferença de profundidade entre o ponto alto e o ponto baixo do sarjetão, usada quando modo_declividade = ''desnivel_fixo''.';
comment on column resultados_sarjeta.declividade_transversal_min_m_m is 'Declividade transversal no ponto alto (dente de serra) — a máxima fica em declividade_transversal_sarjeta_m_m, que já existia.';
