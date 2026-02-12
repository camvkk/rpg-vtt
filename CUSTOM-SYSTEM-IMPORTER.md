# Custom System Importer 📖

O **Custom System Importer** permite que DMs importem seus sistemas de RPG personalizados através de documentos de texto, que são então processados pela IA para criar fichas de personagem estruturadas.

## ✨ Funcionalidades

### Para o DM:
- **Upload de Documentos**: Suporte a .txt, .md, .pdf, .docx
- **Paste de Texto**: Cole texto direto do Google Docs
- **Múltiplos Documentos**: Adicione vários documentos antes de processar
- **IA Parsing**: OpenAI GPT-4.1-mini analisa e estrutura o sistema
- **Preview**: Veja o sistema processado antes de confirmar
- **Reprocessar**: Tente novamente se o resultado não ficou bom

### Para os Jogadores:
- **Fichas Dinâmicas**: Baseadas no sistema customizado do DM
- **Atributos do Sistema**: Stats definidos pelo sistema
- **Seletor de Raça/Classe**: Com modificadores automáticos
- **Perícias Customizadas**: Baseadas nos stats do sistema
- **Equipamentos**: Lista dos itens disponíveis no sistema
- **Mecânicas Especiais**: Botões de dados para regras especiais
- **Referência de Regras**: Seção com todas as regras do sistema

## 🚀 Como Usar

### 1. Configuração
```bash
# 1. Configure a chave da OpenAI
cp .env.example .env
# Edite .env e adicione sua OPENAI_API_KEY

# 2. Instale dependências (já feito)
npm install openai mammoth pdf-parse multer
```

### 2. Criando Campanha Customizada
1. Crie uma nova campanha
2. Selecione **"Sistema Customizado"** ao criar
3. Entre na sala como DM

### 3. Importando Sistema
1. Clique no botão **"📖 Sistema"** na barra do DM
2. Faça upload de documentos ou cole texto
3. Clique **"🚀 Processar Sistema"**
4. Aguarde a IA analisar (alguns segundos)
5. Revise o resultado e clique **"✅ Confirmar"**

### 4. Usando o Sistema
- Jogadores abrem a ficha e veem o sistema customizado
- DM pode reprocessar o sistema a qualquer momento
- Dados ficam salvos na campanha

## 📋 Formato dos Documentos

### O que a IA reconhece:
- **Atributos/Stats**: Força, Destreza, Inteligência, etc.
- **Raças**: Com modificadores e traços
- **Classes**: Com habilidades e proficiências  
- **Perícias**: Ligadas aos atributos
- **Equipamentos**: Armas, armaduras, itens
- **Magias**: Com níveis, escolas, danos
- **Regras**: Mecânicas especiais
- **Dados Customizados**: Fórmulas especiais

### Exemplo de Documento:
```markdown
# Sistema Fantasia Medieval

## Atributos
- **Força (FOR)**: Poder físico e resistência
- **Agilidade (AGI)**: Velocidade e destreza  
- **Intelecto (INT)**: Conhecimento e magia
- **Vitalidade (VIT)**: Saúde e resistência

## Raças
### Élfico
- Modificadores: +2 AGI, +1 INT, -1 FOR
- Traços: Visão Noturna, Resistência a Magia

### Anão  
- Modificadores: +2 FOR, +1 VIT, -1 AGI
- Traços: Resistência a Venenos, Conhecimento em Forjaria

## Classes
### Guerreiro
- Dado de Vida: d10
- Stats Primários: FOR, VIT
- Habilidades:
  - Nível 1: Ataque Poderoso
  - Nível 3: Fúria de Batalha

### Mago
- Dado de Vida: d6
- Stats Primários: INT, AGI  
- Habilidades:
  - Nível 1: Detectar Magia
  - Nível 2: Mísseis Mágicos
```

## 🔧 Arquitetura Técnica

### Banco de Dados
```sql
CREATE TABLE campaign_system (
  campaign_id TEXT PRIMARY KEY,
  system_data TEXT NOT NULL,      -- JSON: sistema parseado
  raw_documents TEXT,             -- JSON: documentos originais  
  parsed_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);
```

### Endpoints
- **POST `/api/upload-system-doc`**: Upload de documentos
- **POST `/api/parse-system`**: Processar com IA

### Eventos Socket
- **`system:get`**: Buscar dados do sistema
- **`system:parsed`**: Broadcast quando sistema é atualizado

### Prompt da IA
A IA usa um prompt estruturado que:
- Extrai atributos, raças, classes, perícias, equipamentos
- Mantém o idioma original dos documentos
- Gera JSON estruturado padronizado
- Omite seções não encontradas nos documentos

## 🎯 Exemplos de Uso

### Sistema Cyberpunk
```markdown
# CyberRPG 2080

## Atributos  
- **CORPO**: Força física e resistência
- **REFLEXOS**: Velocidade e coordenação
- **MENTE**: Inteligência e hacking
- **TECH**: Conhecimento tecnológico
- **COOL**: Carisma e sangue frio

## Equipamentos
### Pistola Neural
- Tipo: Arma
- Dano: 2d6+REFLEXOS
- Propriedades: Cybernética, Atordoante

## Mecânicas
### Hack Sistema  
- Fórmula: 1d20+MENTE+TECH
- Descrição: Invade sistemas eletrônicos
```

### Sistema Horror Cósmico
```markdown
# Mistérios de Arkham

## Atributos
- **FORÇA**: Poder físico
- **AGILIDADE**: Reflexos e velocidade  
- **INTELECTO**: Conhecimento e dedução
- **SANIDADE**: Estabilidade mental

## Perícias
- **Investigação**: Ligada a INTELECTO
- **Ocultismo**: Ligada a INTELECTO  
- **Sobrevivência**: Ligada a FORÇA
- **Furtividade**: Ligada a AGILIDADE

## Regras Especiais
### Teste de Sanidade
Quando confrontado com o sobrenatural, role 1d20+SANIDADE.
Falha crítica: Perde 1d4 pontos de sanidade permanentemente.
```

## 🚨 Troubleshooting

### IA não processou corretamente
- Certifique-se que os documentos estão bem organizados
- Use seções claras (títulos, listas)
- Evite texto muito confuso ou ambíguo
- Tente reprocessar com documentos revisados

### Erro de API
- Verifique se OPENAI_API_KEY está configurada
- Confirme que tem créditos na conta OpenAI
- Documentos muito grandes podem dar timeout

### Sistema não aparece na ficha
- Confirme que a campanha usa "Sistema Customizado"
- Verifique se o sistema foi confirmado após processamento
- Recarregue a página se necessário

## 💡 Dicas

### Para DMs:
- **Documente bem**: Quanto mais claro o documento, melhor o resultado
- **Teste iterativo**: Comece com um documento simples e vá adicionando
- **Use exemplos**: A IA entende melhor com exemplos concretos
- **Organize por seções**: Use títulos claros para cada parte do sistema

### Para Jogadores:
- **Explore a ficha**: Teste os botões de dados e mecânicas
- **Leia as regras**: Use a seção de referência durante o jogo
- **Feedback ao DM**: Reporte problemas ou sugestões

## 🎲 Integração com VTT

O sistema se integra perfeitamente com:
- **Dados automáticos**: Clique em qualquer stat/skill para rolar
- **Chat**: Resultados aparecem no chat da mesa
- **Persistência**: Fichas salvas automaticamente
- **Tempo real**: Mudanças sincronizadas entre jogadores

---

**Criado para o RPG VTT** - Sistema completo de mesa virtual para RPG com suporte a sistemas customizados via IA.