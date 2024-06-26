chrome.runtime.onMessage.addListener(parseDoc);

enum Heading {
    H2 = 'div.heading-wrapper[data-heading-level="h2"]',
    H3 = 'div.heading-wrapper[data-heading-level="h3"]',
    H4 = 'div.heading-wrapper[data-heading-level="h4"]',
    H5 = 'div.heading-wrapper[data-heading-level="h5"]',
}

function getContentElement(): HTMLDivElement {
    return findElement<HTMLDivElement>('div.content');
}

function parseDocTitle(): string {
    return getContentElement().querySelector('h1').textContent;
}

function parseDoc(request: {action: string}, _sender: any, sendResponse: (message: {data: JSONFormat}) => void) {
    enum Action {
        parseEnum = 'parseEnum',
        parseClass = 'parseClass',
        parseInterface = 'parseInterface',
        parseObjects = 'parseObject',
        parseConstants = 'parseConstant',
        parseProperties = 'parseProperty',
        parseFunctions = 'parseFunction',
        parseExamples = 'parseExample'
    }

    switch(request.action) {
        case Action.parseEnum:
            sendResponse({ data: parseEnum() });
            break;
        case Action.parseClass:
            sendResponse({ data: parseClass() });
            break;
        case Action.parseInterface:
            sendResponse({ data: parseInterface() });
            break;
        case Action.parseObjects:
            sendResponse({ data: parseObjects() });
            break;
        case Action.parseConstants:
            findAndProcessSectionByTitle('Constants', (section: HTMLDivElement) => {
                sendResponse({ data: parseConstants(section) });
            })
            break;
        case Action.parseProperties:
            findAndProcessSectionByTitle('Properties', (section: HTMLDivElement) => {
                sendResponse({ data: parseProperties(section) });
            });
            break;
        case Action.parseFunctions:
            findAndProcessSectionByTitle('Methods', (section: HTMLDivElement) => {
                sendResponse({ data: parseFunctions(section) });
            });
            break;
        case Action.parseExamples:
            sendResponse({ data: parseExamples() });
            break;
        default:
            sendResponse({ data: null });
            break;
    }

    return true;
}

function parseEnum(): FormatEnum {
    const sections = Array.from(getContentElement().querySelectorAll(Heading.H2));

    let data: FormatEnum = {
        name: parseDocTitle(),
        description: getContentElement().querySelector('p').textContent.trim(),
        constants: []
    };

    sections.forEach(section => {
        const sectionTitle: string = section.querySelector('h2').textContent;
        if (sectionTitle?.includes('Constants')) data.constants = parseConstants(section);
    });

    return data;
}

function parseClass(): FormatClass {
    try {
        const sections = findAllElement<HTMLDivElement>(`div.content ${Heading.H2}`);

        let data: FormatClass = {
            name: parseDocTitle(),
            description: parseClassDescription(),
            properties: [],
            methods: [],
            constants: [],
            examples: parseExamples()
        };
        
        enum HeadingName {
            Properties = 'Properties',
            Methods = 'Methods',
            Constants = 'Constants',
        }
    
        sections.forEach(section => {
            const sectionTitle: string = section.querySelector('h2').textContent;
    
            if (sectionTitle?.includes('Extends') || 
                sectionTitle?.includes(`Classes that extend ${data.name}`)
            ) {
                const extendsClasses: string = parseExtend(section).join(', ');
                data.description += ` Extends: ${extendsClasses}.`;
            } else {
                switch (sectionTitle) {
                    case HeadingName.Properties:
                        data.properties = parseProperties(section);
                        break;
                    case HeadingName.Methods:
                        data.methods = parseFunctions(section);
                        break;
                    case HeadingName.Constants:
                        data.constants = parseConstants(section);
                        break;
                    default:
                        break;
                }
            }
        });
        return data;
    } catch (error) {
        console.error('Error during scrape', error);
        throw error;
    }
}

function parseClassDescription(): string {
    const cautions: NodeListOf<HTMLDivElement> = getContentElement().querySelectorAll('div.alert.is-danger');
    const visibleCautions = Array.from(cautions).filter(div => div.offsetWidth > 0 && div.offsetHeight > 0);
    const caution = visibleCautions[0];
    
    if (caution && caution.nextElementSibling?.matches('p')) {
        const p = caution?.nextElementSibling?.textContent ?? '';
        const description = caution?.textContent.trim() + p;
        return description;
    } else {
        return getContentElement().querySelector('p').textContent;
    }
}

function parseExtend(starterHeading: Element): string[] {
    const extendsArray: string[] = [];

    // Start to the element after the 'Extends' heading
    let element: Element = starterHeading.nextElementSibling;

    while (element && !element.matches(Heading.H2)) {
        if (element.matches('ul')) {
            const extendsList = Array.from(element.querySelectorAll('li'));
            extendsList.forEach((extend) => {
                extendsArray.push(extend.textContent ?? 'No extends found.');
            });
        }

        element = element.nextElementSibling;
    }

    return extendsArray;
}

function parseProperties(starterHeading: Element): _Property[] {
    const properties: _Property[] = [];

    // Start to the element after the 'Properties' heading
    let elements = iterateElementUntil(starterHeading, elem => elem.matches(Heading.H2));

    elements.forEach(nextElement => {
        if (nextElement.matches(Heading.H3)) {
            const propertyName: string = nextElement.querySelector('h3')?.textContent ?? '';
            const propertyDescription: string[] = [];

            let propertyElements = iterateElementUntil(nextElement, elem => elem.matches(Heading.H3));
            propertyElements.forEach(element => {
                if (element.matches('p') && element.textContent) {
                    propertyDescription.push(element.textContent);
                }

                if (element.matches('div.alert.is-warning')) {
                    propertyDescription.push(element.textContent);
                }
            });

            properties.push({ 
                name: propertyName, 
                description: cleanTextContent(propertyDescription.join('\n')) 
            });
        }
    });

    return properties;
};

function parseFunctions(starterHeading: Element): _Function[] {
    const _function: _Function[] = [];
    const addNewFunction = (element: Element) => {
        const functionName: string = element.querySelector('h3')?.innerText ?? '';
        const functionDetails = extractFunctionDetails(element);

        _function.push({
            name: functionName,
            description: cleanTextContent(functionDetails.description.join('\n')),
            parameters: functionDetails.parameters,
        });

        return;
    }

    // Start to the element after the 'Methods' heading
    let elements = iterateElementUntil(starterHeading, elem => elem.matches(Heading.H2));
    elements.forEach(element => {
        const isStable = element.matches(Heading.H3);
        const isExperimental = element.matches('div[data-moniker="minecraft-bedrock-experimental"]') && element.querySelector(Heading.H3);

        if (isStable) {
            addNewFunction(element);
        }

        if (isExperimental) {
            addNewFunction(element.querySelector(Heading.H3));
        }
    });
        
    return _function;
};

function extractFunctionDetails(startElement: Element) {
    let elements = iterateElementUntil(startElement, elem => elem.matches(Heading.H3));

    const description: string[] = [];
    const parameters: Parameter[] = [];

    elements.forEach(element => {
        parseFunctionDescription(element, description);
        parseParameters(element, parameters);
    });

    return { description, parameters };
}

function parseFunctionDescription(element: Element, functionDescription: string[]) {
    // Description
    if (element.matches('p') && element.textContent) {
        functionDescription.push(element.textContent ?? '');
    } else if (element.matches('ul') && element.previousElementSibling?.matches('p')) {
        Array.from<HTMLLIElement>(element.querySelectorAll('li'))
            .forEach(li => functionDescription.push(li.textContent ?? ''));
    }

    // Returns
    if (element.matches(Heading.H4) && 
        element.querySelector('h4')?.textContent?.includes('Returns')
    ) {
        functionDescription.push(element.textContent);
    }

    // Alerts
    const alerts: string[] = ["is-danger", "is-primary", "is-warning"];
    alerts.forEach((alert) => {
        if (element.matches(`div.alert.${alert}`)) {
            functionDescription.push(element.textContent);
        }
    });
}

function parseParameters(element: Element, parameters: Parameter[]) {
    if (element.matches('ul') && element.previousElementSibling?.matches(Heading.H4)) {
        const isParameterList = element.previousElementSibling.textContent.includes('Parameters');

        if (isParameterList) {
            Array.from(element.querySelectorAll('li')).forEach(li => {
                const paragraphs = li.querySelectorAll('p');
                
                if (paragraphs.length > 1) {
                    const parameterName = paragraphs[0].textContent;
                    const parameterDescription = paragraphs[1]?.textContent ?? '';

                    parameters.push({ 
                        name: parameterName, 
                        description: parameterDescription 
                    });

                    return;
                }

                parameters.push({ name: li.textContent, description: '' })
            });
        }
    }
}

function parseInterface(): FormatInterface {
    const sections: Element[] = Array.from(getContentElement().querySelectorAll(Heading.H2));

    let data: FormatInterface = {
        name: parseDocTitle(),
        description: getContentElement().querySelector('p').textContent.trim(),
        properties: [],
        examples: parseExamples()
    };

    sections.forEach(section => {
        const sectionTitle: string = section.querySelector('h2').textContent;

        if (sectionTitle?.includes('Properties')) {
            data.properties = parseProperties(section);
        }
    });

    return data;
};

function parseConstants(starterHeading: Element): _Constant[] {
    const constantArray: _Constant[] = [];

    // Start to the element after the 'Constants' heading
    let elements = iterateElementUntil(starterHeading, elem => elem.matches(Heading.H2));

    // Loop through all elements until the next `h2`
    elements.forEach(nextElement => {
        if (nextElement.matches(Heading.H3)) {
            const constantName: string =  nextElement.querySelector('h3').textContent;
            const constantDescription: string[] = [];
            
            // Loop through all elements until the next `h3`
            let constantElements = iterateElementUntil(nextElement, elem => elem.matches(Heading.H3));
            constantElements.forEach(element => {
                if (element.matches('p') && element.textContent) {
                    constantDescription.push(element.textContent);
                }
            });

            constantArray.push({ 
                name: constantName, 
                description: constantDescription.join('\n').toString() 
            });
        }
    });
        
    return constantArray;
};

function parseObjects(): _Object[] {
    const sections: Element[] = Array.from(getContentElement().querySelectorAll(Heading.H2));
    const objects: _Object[] = [];

    sections.forEach(section => {
        if (section.querySelector('h2').textContent.includes('Objects')) {
            let elements = iterateElementUntil(section, elem => elem.matches(Heading.H2));
            elements.forEach(nextElement => {
                if (nextElement.matches(Heading.H3)) {
                    let objectName: string = nextElement.querySelector('h3').textContent;
                    let objectDescription: string[] = [];

                    let objectElements = iterateElementUntil(nextElement, elem => elem.matches(Heading.H3));
                    objectElements.forEach(element => {
                        if (element.matches('p') && element.textContent) {
                            objectDescription.push(element.textContent);
                        }
                    })

                    objects.push({ 
                        name: objectName, 
                        description: objectDescription.join('\n').toString() 
                    });
                }
            });
        }
    });
    
    return objects;
}

function parseExamples(): Example[] {
    const exampleCodes: Example[] = [];
    const exampleSections = Array.from(getContentElement().querySelectorAll(Heading.H4));

    exampleSections.forEach((section) => {
        const heading = section.querySelector('h4');

        if (heading?.textContent?.includes('Examples')) {
            let elements = iterateElementUntil(section, elem => elem.matches(Heading.H4));
            elements.forEach(nextElement => {
                if (nextElement.matches(Heading.H5)) {
                    const codeName = nextElement.querySelector('h5')?.textContent ?? "";

                    let codeElement = nextElement.nextElementSibling;
                    while(codeElement && !codeElement.matches('pre')) {
                        codeElement = codeElement.nextElementSibling;
                    }

                    if (codeName && codeElement && codeElement.matches('pre')) {
                        const code = cleanTextContent(codeElement.textContent) ?? "";
                        const newExampleCode = { codeName, code };

                        if (!exampleCodes.some(exampleCode => exampleCode.codeName === newExampleCode.codeName && 
                            exampleCode.code === newExampleCode.code)) {
                                exampleCodes.push(newExampleCode);
                        }
                    }
                }
            })
        }
    });

    return exampleCodes;
}

// UTILITY FUNCTIONS

function filterWords(text: string, options: FilterOptions): string {
    let filterRegex = new RegExp('\\b(' + options.wordsToFilter.join('|') + ')\\b', 'gi');
    return text.replace(filterRegex, '').trim(); 
}

function iterateElementUntil(startElement: Element, condition: (elem: Element) => boolean): Element[] {
    const elements: Element[] = [];

    let nextElement = startElement.nextElementSibling;

    while (nextElement && !condition(nextElement)) {
        elements.push(nextElement);
        nextElement = nextElement.nextElementSibling;
    }

    return elements;
}

function findAndProcessSectionByTitle(titleSection: string, action: (section: Element) => void): void {
    const sections = findAllElement<HTMLDivElement>(`div.content ${Heading.H2}`);

    sections.forEach(section => {
        const sectionTitle = section.querySelector('h2')?.textContent;
        if (sectionTitle?.includes(titleSection)) {
            action(section);
        }
    });
}

function cleanTextContent(text: string): string {
    return text.replace(/\n\s*\n/g, '\n');
}

function findAllElement<T extends Element>(element: string): T[] {
    return Array.from(document.querySelectorAll(element) as NodeListOf<T>);
}

function findElement<T extends Element>(element: string): T {
    return document.querySelector(element) as T;
}