import Collect from './collect';
import fs from 'fs';

export class CollectHTML extends Collect {
	static async afterPass(passContext: any, options?: any): Promise<any> {
		try {
			const {page} = passContext;
			const result = [];

			await page.waitForSelector('body')
			const javascriptHtml = await page.evaluate(
				() => document.querySelector('*')!.outerHTML
			);
			const vanillaHtml = await page.content();

			if (vanillaHtml === javascriptHtml) {
				result.push(javascriptHtml);
			} else if (vanillaHtml !== javascriptHtml) {
				result.push(
					javascriptHtml, vanillaHtml
				);
			}

			if (options.production) {
				const pathName = `as-${Date.now()}.html`;
				fs.writeFile(
					`./traces/assets/html/${pathName}`,
					javascriptHtml,
					err => {
						if (err) {
							throw new Error(err?.message);
						}
					}
				);
			}
		
			
			return {
				html:result
			}
			
		} catch (error) {
			console.error('HTML-COLLECT', error);
		}
	}
}
