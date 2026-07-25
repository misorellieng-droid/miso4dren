-- 010_sarjetao_um_lado.sql — miso4dren
-- Adiciona o tipo de seção 'um_lado' (sarjeta comum, de um lado só) ao
-- módulo "sarjetão em dente de serra", que até aqui só suportava 'simetrico'
-- (V alimentado dos dois lados). A única diferença física entre os dois é o
-- fator de largura usado na fórmula de delta_h — largura_sarjetao_m inteira
-- entra no cálculo se um_lado, só a metade se simetrico (ver
-- src/engine/sarjetao/index.ts). Registros já existentes são todos
-- 'simetrico' (único tipo suportado até agora), daí o default no backfill.

alter table resultados_sarjetao_dente_serra
  add column tipo_secao text not null default 'simetrico'
  check (tipo_secao in ('simetrico', 'um_lado'));

comment on column resultados_sarjetao_dente_serra.tipo_secao is '''simetrico'' (V alimentado dos dois lados, largura_sarjetao_m/2 entra em delta_h) | ''um_lado'' (sarjeta comum, largura_sarjetao_m inteira entra em delta_h).';
