-- Degraus e patamares da escada hidráulica (etapa E5b).
-- O plugin Civil 3D envia, junto de B e H, o espelho e o degrau escolhidos e o perfil do talude
-- (faces com comprimento horizontal e desnível, e as bermas planas entre elas). O miso4dren conta os
-- degraus, confere se o piso cabe em cada face e calcula o patamar (engine/escadaHidraulica.ts).
-- Só adiciona colunas, nada é apagado; pode rodar mais de uma vez.

alter table trechos add column if not exists escada_espelho_m double precision;
alter table trechos add column if not exists escada_degrau_m double precision;
-- {"faces":[{"comprimentoM":9.0,"desnivelM":6.0}],"bermasM":[]}
alter table trechos add column if not exists escada_perfil jsonb;
