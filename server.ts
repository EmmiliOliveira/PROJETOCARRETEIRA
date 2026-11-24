import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = 'gemini-4-hydrogen';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Chave GEMINI_API_KEY não configurada no servidor. Configure em Settings > Secrets.',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatApiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('GEMINI_API_KEY')) {
    return { status: 500, message: raw };
  }
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return {
      status: 403,
      message:
        'Erro de autenticação na API Gemini. Verifique sua chave em Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message:
        'Limite de requisições da IA atingido no momento. Aguarde alguns segundos e tente novamente.',
    };
  }
  return {
    status: 500,
    message: `Falha ao processar solicitação com a IA: ${raw}`,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, model: MODEL_NAME });
  });

  // 1. AI Vision Plate / Fleet ID Scanner
  app.post('/api/ai/scan-plate', async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body as {
        imageBase64?: string;
        mimeType?: string;
      };
      if (!imageBase64 || !mimeType) {
        res.status(400).json({ error: 'Imagem (imageBase64 e mimeType) é obrigatória.' });
        return;
      }

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
            {
              text:
                'Você é um sistema OCR industrial para embarque de carretas em balsas (Transportes Bertolini Ltda.). ' +
                'Analise a imagem e identifique a placa brasileira (padrão Mercosul ou antigo, ex: QEC0740, RBY3B65) ' +
                'ou código identificador de frota/veículo (ex: 8477, 130P, 8883). ' +
                'Retorne apenas caracteres alfanuméricos em maiúsculo no campo detectedCode (sem espaços ou hífens). ' +
                'Se não houver placa ou código legível na imagem, retorne string vazia em detectedCode e explique em notes.',
            },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedCode: {
                type: Type.STRING,
                description: 'Placa ou código de frota normalizado em maiúsculas sem hífen.',
              },
              confidence: {
                type: Type.STRING,
                description: 'Alta, Média ou Baixa',
              },
              notes: {
                type: Type.STRING,
                description: 'Observação breve em português sobre a leitura visual.',
              },
            },
            required: ['detectedCode', 'confidence', 'notes'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 2. AI Expedition Manifest Extractor (Photo, PDF, or Text)
  app.post('/api/ai/extract-manifest', async (req, res) => {
    try {
      const { fileBase64, mimeType, rawText } = req.body as {
        fileBase64?: string;
        mimeType?: string;
        rawText?: string;
      };
      if (!fileBase64 && !rawText) {
        res.status(400).json({ error: 'Envie uma foto, arquivo PDF/imagem ou texto do manifesto.' });
        return;
      }

      const ai = getAiClient();
      const parts: Array<
        { inlineData: { mimeType: string; data: string } } | { text: string }
      > = [];

      if (fileBase64 && mimeType) {
        parts.push({
          inlineData: {
            mimeType,
            data: fileBase64,
          },
        });
      }

      parts.push({
        text:
          'Extraia TODAS as linhas de frotas/carretas desta folha de manifesto de expedição (Transportes Bertolini Ltda.). ' +
          'Colunas esperadas: Unidade Destino, Veículo, Chassi/Identificador (placa), Descrição Carga, Peso Carga (em kg numérico), Peso Total (em kg numérico), BLS, EM. ' +
          'Atenção à formatação numérica brasileira: "25.785,576" significa 25785.576 kg (não multiplique por 1000). ' +
          'Converta pesos para número decimal em kg. Deixe veiculo vazio ("") se a célula estiver em branco.' +
          (rawText ? `\n\nTexto/CSV fornecido:\n${rawText}` : ''),
      });

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: { parts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              fleets: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    unidadeDestino: { type: Type.STRING },
                    veiculo: { type: Type.STRING },
                    chassiIdentificador: { type: Type.STRING },
                    descricaoCarga: { type: Type.STRING },
                    pesoCargaKg: { type: Type.NUMBER },
                    pesoTotalKg: { type: Type.NUMBER },
                    bls: { type: Type.STRING },
                    em: { type: Type.STRING },
                  },
                  required: [
                    'unidadeDestino',
                    'veiculo',
                    'chassiIdentificador',
                    'descricaoCarga',
                    'pesoCargaKg',
                    'pesoTotalKg',
                    'bls',
                    'em',
                  ],
                },
              },
              summaryNote: { type: Type.STRING },
            },
            required: ['fleets', 'summaryNote'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{"fleets":[]}').trim());
      res.json(parsed);
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 3. AI Indicative Pre-Map & Barge Stowage Guidelines
  app.post('/api/ai/indicative-map', async (req, res) => {
    try {
      const { specs, fleetsSummary } = req.body as {
        specs: {
          name: string;
          rows: number;
          cols: number;
          maxCapacityTons: number;
          route: string;
          riverCondition: string;
          trimPreference: string;
          specialNotes: string;
        };
        fleetsSummary: {
          totalFleets: number;
          boardedCount: number;
          totalWeightTons: number;
        };
      };

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents:
          `Você é engenheiro naval especialista em estivagem carreteira Ro-Ro fluvial (Transportes Bertolini Ltda.). ` +
          `Gere um mapa prévio indicativo de zonas de peso para a balsa abaixo.\n` +
          `Características da Balsa: ${JSON.stringify(specs)}\n` +
          `Resumo atual da carga: ${JSON.stringify(fleetsSummary)}\n` +
          `A grade tem ${specs.rows} faixas transversais (row 0 = Bombordo extremo até row ${specs.rows - 1} = Boreste extremo) ` +
          `e ${specs.cols} posições longitudinais (col 0 = Proa até col ${specs.cols - 1} = Popa junto à RAMPA).\n` +
          `Retorne TODAS as ${specs.rows * specs.cols} células com tier ("pesado" | "medio" | "leve" | "restrito"), ` +
          `faixa recomendada em toneladas (recommendedMinTons e recommendedMaxTons), rationale curto em português, ` +
          `e 3 a 4 diretrizes práticas em guidelines.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              cells: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    row: { type: Type.INTEGER },
                    col: { type: Type.INTEGER },
                    tier: { type: Type.STRING },
                    recommendedMinTons: { type: Type.NUMBER },
                    recommendedMaxTons: { type: Type.NUMBER },
                    rationale: { type: Type.STRING },
                  },
                  required: [
                    'row',
                    'col',
                    'tier',
                    'recommendedMinTons',
                    'recommendedMaxTons',
                    'rationale',
                  ],
                },
              },
              guidelines: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['cells', 'guidelines'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 4. AI Balance & Critical Fleet Advisory
  app.post('/api/ai/analyze-balance', async (req, res) => {
    try {
      const { specs, balance, fleets } = req.body;
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents:
          `Analise o estado atual de estivagem e equilíbrio da balsa carreteira da TBL (Transportes Bertolini Ltda.).\n` +
          `Lembre-se: carretas com status "embarcada" já entraram na balsa e NÃO devem ser movidas, exceto se houver desequilíbrio crítico.\n` +
          `Balsa: ${JSON.stringify(specs)}\n` +
          `Métricas de Equilíbrio: ${JSON.stringify(balance)}\n` +
          `Frotas: ${JSON.stringify(fleets)}\n` +
          `Responda em português técnico e direto para o supervisor de embarque.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              diagnostico: { type: Type.STRING },
              acoesRecomendadas: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              alertaCritico: { type: Type.STRING },
            },
            required: ['diagnostico', 'acoesRecomendadas', 'alertaCritico'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 5. AI Operational Report Generator
  app.post('/api/ai/generate-report', async (req, res) => {
    try {
      const { specs, balance, fleets, occurrences, scanSummary } = req.body;
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents:
          `Elabore um parecer operacional formal para o Relatório de Embarque Carreteiro da Transportes Bertolini Ltda. (TBL).\n` +
          `Dados da Balsa: ${JSON.stringify(specs)}\n` +
          `Análise de Equilíbrio: ${JSON.stringify(balance)}\n` +
          `Resumo de Frotas: ${JSON.stringify(fleets)}\n` +
          `Resumo de Leituras do Scanner: ${JSON.stringify(scanSummary)}\n` +
          `Ocorrências Registradas: ${JSON.stringify(occurrences)}\n` +
          `Seja objetivo, técnico, em português do Brasil, citando números reais dos dados fornecidos.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              resumoExecutivo: { type: Type.STRING },
              parecerEstabilidade: { type: Type.STRING },
              pontosAtencao: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              recomendacaoViagem: { type: Type.STRING },
            },
            required: [
              'resumoExecutivo',
              'parecerEstabilidade',
              'pontosAtencao',
              'recomendacaoViagem',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({
        generatedAt: new Date().toISOString(),
        ...parsed,
      });
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TBL Operação Carreteira server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
