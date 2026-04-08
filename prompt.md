🧠 CONTEXTO DO PROJETO

Quero construir um web app estilo chat (semelhante ao ChatGPT), com integração com IA usando a API do Claude (modelo Haiku 4.5), onde a IA responde perguntas com base em dados de um banco (Supabase).

O sistema deve ter autenticação de usuários, controle de permissões (RBAC) e segurança forte para garantir que usuários só acessem dados autorizados.

⚙️ STACK TECNOLÓGICA
Frontend: React.js (com Next.js)
Backend: Nest.js
Banco de dados: Supabase (PostgreSQL)
Autenticação: Supabase Auth
IA: Claude Haiku 4.5 via API
ORM: Prisma
Estilo UI: moderno, estilo dashboard/chat (inspirado em SaaS)
🎯 OBJETIVO PRINCIPAL

Criar um sistema onde:

O usuário faz login
Envia uma pergunta no chat
O backend valida permissões ANTES de chamar a IA
Se permitido:
Consulta o banco
Envia contexto estruturado para a IA
IA responde com base nesses dados
Se NÃO permitido:
A IA NÃO é chamada
Retorna erro de permissão

🔐 REGRAS CRÍTICAS DE SEGURANÇA
A IA NUNCA deve ser chamada antes da validação de permissão
O backend deve ser o único responsável por:
Verificar permissões
Consultar o banco
Montar o contexto da IA
O frontend nunca acessa diretamente dados sensíveis
Implementar RBAC (Role-Based Access Control)
👥 MODELO DE USUÁRIOS E PERMISSÕES

Criar estrutura:

Tabela: users
id
email
role (admin, user)

Tabela: permissions
id
name (ex: "view_empreendimentos", "view_reservas")

Tabela: role_permissions
role
permission_id
🧠 LÓGICA DO CHAT (BACKEND)

Fluxo obrigatório:

Receber mensagem do usuário
Verificar permissão necessária com base na pergunta

Exemplo:

"Me mostre quantas unidades reservadas tem no empreendimento Uni Ville" → precisa de view_reservas
Se NÃO tiver permissão:
{
  "error": "Você não tem permissão para essa consulta." (Mensagem no chat sem uso de recursos da IA).
}
Se tiver permissão:
Buscar dados no Supabase
Montar contexto estruturado
Enviar para Claude
Trazer resposta ao usuário

Funcionalidades:

Tela de login
Tela de chat estilo ChatGPT
Histórico de mensagens por usuário
Loading enquanto IA responde
Tratamento de erro de permissão
Perguntas limitadas para user e ilimitados para admin

📦 ENTREGÁVEIS ESPERADOS

Quero que você gere:

Estrutura completa de pastas
Código inicial do backend
Integração com Claude
Estrutura do banco no Supabase sem dados, pois serão alimentados via API.
Frontend bem estilizado com hovers e animações

🚨 REGRAS IMPORTANTES
Código limpo e escalável
Seguir boas práticas
Evitar gambiarra
Pensar como SaaS real

Como dito anteriormente, o banco será alimentado, inicialmente, via API. Vou te passar as instruções:

Vamos alimentar as tables através de uma API do CVCRM:

Table empreendimentos_cvcrm
Get para url = "https://vca.cvcrm.com.br/api/v1/cvbot/empreendimentos"
com Auth "email": NEXT_PUBLIC_EMAIL_CV_API_VCA, "token": NEXT_PUBLIC_TOKEN_CV_API_VCA

A responsa virá nesse modelo: 

  {
    "idempreendimento": 36,
    "nome": "AV. HELEUSA CÂMARA",
    "endereco": "R. G - Vitória da Conquista, BA, 45012, Brasil",
    "cidade": "Vitória da Conquista",
    "estado": "Bahia",
    "data_entrega": "31/12/2024",
    "situacao_obra": "Obras Finalizadas",
    "area_construida": null,
    "area_privativa": null,
    "descricao": null,
    "quantidade_unidades_disponiveis": 0,
    "plantas": [],
    "material_campanha": []
  },

  O mais importante ai para alimentarmos a table é:
  "nome"
  "endereco"
  "cidade"
  "estado"
  "data_entrega"

  A outra table de reservas_cvcrm

  Get para url: "https://vca.cvcrm.com.br/api/v1/comercial/reservas?apenas_ativas=false" com a mesma Auth

do response só preciso de:
"44226" <- Número da reserva
"situacao"
"empreendimento"
"unidade": "BL02 - APT 04"
"tipologia": "3 QUARTOS SENDO UMA SUÍTE - TÉRREO"

"titular": {
      "nome": "WEULLER NUNES SILVA"
      "documento": "08417314547"
}

"associados": { (se houver)
 "1": {
        "tipo": "Cônjuge do comprador 01",
        "nome": "JEFERSON DE FREITAS PEREIRA",
        "documento": "07507667510"
 }
}

"corretor": {
      "corretor": "Ananda Barbosa Teixeira",
      "imobiliaria": "EQUIPE PLANTÃO FÍSICO"
}

