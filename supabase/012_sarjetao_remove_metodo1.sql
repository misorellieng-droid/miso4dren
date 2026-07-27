-- 012_sarjetao_remove_metodo1.sql — miso4dren
-- Remove o "Método 1" (Manning genérico, seção retangular equivalente) do
-- módulo sarjetão em dente de serra — por decisão do usuário, mantém-se só
-- o Método 2 (HEC-22/FHWA, geometria composta real calha+via), que já é
-- estritamente mais preciso (área E perímetro reais, não uma aproximação
-- genérica). As colunas m2_* são renomeadas pra nomes genéricos (sem
-- prefixo de método, já que agora só existe um). As colunas m1_* e as de
-- comparação entre métodos (que não fazem mais sentido com um só) são
-- removidas.

alter table resultados_sarjetao_dente_serra
  rename column m2_comprimento_m to comprimento_m;
alter table resultados_sarjetao_dente_serra
  rename column m2_iteracoes to iteracoes;
alter table resultados_sarjetao_dente_serra
  rename column m2_convergiu to convergiu;
alter table resultados_sarjetao_dente_serra
  rename column m2_iteracoes_tc to iteracoes_tc;
alter table resultados_sarjetao_dente_serra
  rename column m2_convergiu_tc to convergiu_tc;
alter table resultados_sarjetao_dente_serra
  rename column m2_lamina_critica_m to lamina_critica_m;
alter table resultados_sarjetao_dente_serra
  rename column m2_velocidade_ms to velocidade_ms;
alter table resultados_sarjetao_dente_serra
  rename column m2_vazao_m3s to vazao_m3s;
alter table resultados_sarjetao_dente_serra
  rename column m2_declividade_longitudinal_m_m to declividade_longitudinal_m_m;
alter table resultados_sarjetao_dente_serra
  rename column m2_tc_convergido_min to tc_convergido_min;
alter table resultados_sarjetao_dente_serra
  rename column m2_intensidade_mm_h to intensidade_mm_h;

alter table resultados_sarjetao_dente_serra
  drop column m1_comprimento_m,
  drop column m1_iteracoes,
  drop column m1_convergiu,
  drop column m1_iteracoes_tc,
  drop column m1_convergiu_tc,
  drop column m1_lamina_critica_m,
  drop column m1_velocidade_ms,
  drop column m1_vazao_m3s,
  drop column m1_declividade_longitudinal_m_m,
  drop column m1_tc_convergido_min,
  drop column m1_intensidade_mm_h,
  drop column diferenca_percentual,
  drop column comprimento_recomendado_m,
  drop column metodo_recomendado;
