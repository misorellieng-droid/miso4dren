-- Campos de escavação por peça (tabela "Quantidade" da Rede Pluvial): cada
-- tamanho de tubo do catálogo passa a ter também as dimensões de vala usadas
-- pra calcular volume de escavação/berço/reaterro daquele diâmetro.
-- Nullable -- peças sem esses dados só não entram no cálculo de quantidade
-- (seguem funcionando normalmente pro resto do catálogo: export XML, dropdown
-- de diâmetro etc.).

alter table biblioteca_pecas
  add column if not exists largura_escavacao_m double precision,
  add column if not exists talude_escavacao_hv double precision,
  add column if not exists altura_berco_m double precision;

comment on column biblioteca_pecas.largura_escavacao_m is 'Largura da vala no FUNDO (nível do berço/tubo), em metros.';
comment on column biblioteca_pecas.talude_escavacao_hv is 'Talude da escavação como razão H:V -- 1.0 = 1:1 (alarga 1m de cada lado a cada 1m de profundidade), 0.5 = 1:2.';
comment on column biblioteca_pecas.altura_berco_m is 'Altura da camada de berço (lastro) abaixo do tubo, em metros.';
