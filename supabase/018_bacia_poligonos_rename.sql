-- Opcional: limpeza. A coluna "poligonos" (plural) já existe e está em uso
-- — confirmado via probe direto no banco. Sobrou a coluna antiga "poligono"
-- (singular, de uma execução anterior da 017) sem uso; pode rodar isso pra
-- remover, ou deixar como está (não atrapalha nada, só ocupa espaço).

alter table bacias drop column if exists poligono;
