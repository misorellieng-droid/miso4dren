-- Diâmetro externo do tubo de chegada na escada hidráulica hoje só é calculado (diâmetro do
-- trecho + 2× espessura de parede, buscada na biblioteca de peças por material) -- quando o
-- material não bate com nada da biblioteca, fica sem espessura e cai no diâmetro interno. Este
-- campo permite sobrescrever manualmente por escada; null mantém o cálculo automático (ver
-- EscadasHidraulicasPage.tsx).

alter table trechos add column escada_diametro_externo_m double precision;
