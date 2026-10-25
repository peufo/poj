/**
 * Documents de découverte OAuth : publics, lisibles depuis un navigateur (outils comme le
 * MCP Inspector). Claude les lit côté serveur et n'a pas besoin de CORS.
 */
export async function publicMetadata(response: Response | Promise<Response>): Promise<Response> {
	const res = await response;
	const headers = new Headers(res.headers);
	headers.set('Access-Control-Allow-Origin', '*');
	return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
