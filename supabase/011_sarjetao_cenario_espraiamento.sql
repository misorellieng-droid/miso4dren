-- 011_sarjetao_cenario_espraiamento.sql — miso4dren
-- Adiciona o campo cenario_espraiamento: registra qual declividade do
-- sarjetao (minimo=Sx_baixo, medio=media, maximo=Sx_alto) foi escolhida pelo
-- engenheiro para gerar o resultado principal salvo/exportado. Antes desta
-- migracao o app so calculava com Sx medio, sem opcao de escolha — daí o
-- default 'medio' no backfill, que preserva o comportamento dos registros
-- ja existentes.

alter table resultados_sarjetao_dente_serra
  add column cenario_espraiamento text not null default 'medio'
  check (cenario_espraiamento in ('minimo', 'medio', 'maximo'));

comment on column resultados_sarjetao_dente_serra.cenario_espraiamento is '''minimo'' (Sx_baixo, mais conservador) | ''medio'' (media entre Sx_alto e Sx_baixo) | ''maximo'' (Sx_alto) — qual declividade do sarjetao gerou o resultado principal desta linha.';
