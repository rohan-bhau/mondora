import { dispatch } from "@/lib/studio";
import { NextRequest } from "next/server";



async function handle(
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
    if(request.method === "POST") {
        const origin = request.headers.get("origin")

        if(origin) {
            let sameOrigin = false;
            try {
                const url = new URL(origin);
                sameOrigin =
                    url.host === request.headers.get("host")  && 
                    url.protocol === request.nextUrl.protocol;
            } catch {}

            if (!sameOrigin) 
                return Response.json(
                    {error: "Cross request origin are not allowed"},
                    {status: 403}
                )
            
        }
    }
    try {
        const {path} = await context.params;
        const body = request.method === "POST" ? await request.json() : {}
        if(!body || typeof body !== "object" || Array.isArray(body)) 
            throw new Error("Expected a json object")

        return Response.json(await dispatch(request.method, path, body), {
            headers: {"Cache-Control": "no-store"}
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : "The request failed. Plese retry.";
        console.warn(`[studio] ${request.method}:${message}`);
        return Response.json({error:message}, {status:400})
    }
}

export const GET = handle
export const POST = handle