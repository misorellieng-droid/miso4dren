-- Escada hidráulica (dissipador em degraus) não é fisicamente um tubo circular -- a checagem de
-- conformidade de Manning/y-D/velocidade de autolimpeza não se aplica, e o dimensionamento é
-- feito com fórmula própria (Q = 2,07 x B^0,90 x H^1,60), numa tela separada.

alter table trechos add column eh_escada_hidraulica boolean default false;
-- largura útil (m) e altura do fluxo (m) adotadas no dimensionamento da escada -- só fazem
-- sentido quando eh_escada_hidraulica = true; ficam null nos demais trechos.
alter table trechos add column escada_largura_m double precision;
alter table trechos add column escada_altura_fluxo_m double precision;
