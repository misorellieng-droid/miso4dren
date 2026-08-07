-- O "mínimo p/ alertar" de recobrimento (tela Rede Pluvial) ficava só em useState, igual os
-- demais critérios de conformidade antes da migração 025 -- volta pro padrão (0 m) a cada
-- recarregamento. Passa a viver junto dos outros critérios da revisão.

alter table revisoes add column criterio_recobrimento_minimo_m double precision default 0;
