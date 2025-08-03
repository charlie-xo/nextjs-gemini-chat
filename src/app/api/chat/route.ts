import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/generative-ai';

// API കീ നേരിട്ട് ഇവിടെ സജ്ജീകരിച്ചിരിക്കുന്നു
const API_KEY = "AIzaSyCJAj5nbv7XMSVQkK3EknXg4zBXYw6MGjY";

const genAI = new GoogleGenerativeAI(API_KEY);

// Next.js എഡ്ജ് റൺടൈം ഉപയോഗിക്കാൻ നിർദ്ദേശിക്കുന്നു
export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const { history } = await request.json();

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // ചാറ്റ് സെഷൻ ആരംഭിക്കുക
    const chat = model.startChat({
      history: history.slice(0, -1).map((msg: { role: 'user' | 'model', text: string }) => ({
        role: msg.role,
        parts: [{ text: msg.text }],
      })),
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
      },
      safetySettings: [
        {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ]
    });

    const lastMessage = history[history.length - 1].text;

    // സ്ട്രീമിംഗ് പ്രതികരണം നേടുക
    const result = await chat.sendMessageStream(lastMessage);

    // പ്രതികരണം ക്ലയിന്റിലേക്ക് തിരികെ സ്ട്രീം ചെയ്യുക
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          controller.enqueue(new TextEncoder().encode(chunkText));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });

  } catch (error: any) {
    console.error('API Error:', error); // സെർവറിൽ പൂർണ്ണമായ പിശക് ലോഗ് ചെയ്യുക
    // ക്ലയിന്റിന് കൂടുതൽ നിർദ്ദിഷ്ട പിശക് സന്ദേശം അയയ്ക്കുക
    const errorMessage = error.message || 'An unknown error occurred';
    return new Response(`Error from Gemini API: ${errorMessage}`, { status: 500 });
  }
}
