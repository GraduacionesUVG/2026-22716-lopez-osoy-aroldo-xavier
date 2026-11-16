/**
 * @fileoverview Contenido del Formulario de Consentimiento Informado
 *
 * Este archivo centraliza todo el texto e información del documento de consentimiento. 
 * 
 */

export type ContentItem =
    | { kind: 'paragraph'; text: string }
    | { kind: 'paragraph-lead'; lead: string; text: string }
    | { kind: 'bullet-list'; items: Array<{ lead?: string; text: string }> }

export interface ConsentSection {
    number: number
    title: string
    items: ContentItem[]
}

export interface ConsentCardDef {
    id: string
    title: string
    description: string
    chipText: string
    chipColor: 'red' | 'blue' | 'green' | 'gray'
    required: boolean
}

export interface InformedConsentDocumentContent {
    hospitalName: string
    formTitle: string
    institucion: string
    proyecto: string
    introGreeting: string
    introBody: string
    sections: ConsentSection[]
    declarationTitle: string
    declarationInstruction: string
    consentCards: ConsentCardDef[]
    signaturesTitle: string
    patientDataTitle: string
}

export const consentContent: InformedConsentDocumentContent = {
    hospitalName: 'Hospital Regional de Cobán',
    formTitle: 'Formulario de Consentimiento Informado para Padres o Representantes Legales',
    institucion: 'Hospital Regional de Cobán',
    proyecto: 'Sistema SADC - Enf. Genéticas Pediátricas',
    introGreeting: 'Estimado padre, madre o representante legal:',
    introBody:
        'Invitamos a su hijo(a) a participar en un registro especial del Hospital Regional de Cobán para niños con sospecha de enfermedades genéticas o hereditarias. La participación es totalmente voluntaria. Por favor, lea esta información (o pida que se la lean) detenidamente. Si tiene alguna duda, el médico se la explicará.',

    sections: [
        {
            number: 1,
            title: '¿De qué trata este registro?',
            items: [
                {
                    kind: 'paragraph',
                    text: 'Para ayudar a los médicos a identificar enfermedades raras o genéticas de forma más rápida, el hospital está utilizando un nuevo sistema de computadora. Este sistema analiza la información médica de su hijo(a) y la compara con bases de datos internacionales seguras para buscar similitudes con otras enfermedades conocidas.',
                },
            ],
        },
        {
            number: 2,
            title: '¿Qué información guardaremos y cómo se usará?',
            items: [
                {
                    kind: 'paragraph',
                    text: 'Si usted acepta, guardaremos en el expediente electrónico de su hijo(a) lo siguiente:',
                },
                {
                    kind: 'bullet-list',
                    items: [
                        {
                            text: 'La historia médica, síntomas y antecedentes familiares de su hijo(a).',
                        },
                        {
                            lead: 'Fotografías del rostro de su hijo(a):',
                            text: 'Estas fotos son muy importantes porque algunas enfermedades genéticas muestran características específicas en el rostro. Las fotos serán analizadas por un programa de computadora especializado (inteligencia artificial) para ayudar al médico a entender mejor el caso de su hijo(a).',
                        },
                    ],
                },
            ],
        },
        {
            number: 3,
            title: '¿Cuáles son los beneficios y riesgos?',
            items: [
                {
                    kind: 'paragraph-lead',
                    lead: 'Beneficios:',
                    text: 'Esto no tiene ningún costo. Al usar esta tecnología, los médicos tendrán más información para intentar encontrar qué enfermedad podría tener su hijo(a), ayudando a darle un mejor seguimiento médico sin necesidad inmediata de enviar exámenes costosos al extranjero.',
                },
                {
                    kind: 'paragraph-lead',
                    lead: 'Riesgos:',
                    text: 'No hay ningún riesgo físico (no se tomarán muestras de sangre adicionales solo para esto, ni se darán medicamentos).',
                },
            ],
        },
        {
            number: 4,
            title: '¿Cómo protegeremos su privacidad?',
            items: [
                {
                    kind: 'paragraph',
                    text: 'Toda la información y las fotografías de su hijo(a) se guardarán en computadoras muy seguras del hospital. Su nombre y sus datos personales serán protegidos. Solo el personal médico autorizado del hospital sabrá a quién le pertenecen los datos.',
                },
            ],
        },
        {
            number: 5,
            title: 'Sus derechos',
            items: [
                {
                    kind: 'paragraph',
                    text: 'Usted decide si quiere participar o no. Si dice que NO, su hijo(a) seguirá recibiendo su atención médica normal en el hospital sin ningún problema. Usted también puede cambiar de opinión más adelante y pedir que dejemos de usar estos datos.',
                },
            ],
        },
    ],

    declarationTitle: 'Declaración de Consentimiento',
    declarationInstruction:
        'Por favor, marque con una "X" (o seleccione en la pantalla) las siguientes opciones para indicar que está de acuerdo:',

    consentCards: [
        {
            id: 'autorizacion-principal',
            title: 'Autorización principal',
            description:
                'Otorgo mi permiso para que el hospital guarde los datos médicos y las fotografías del rostro de mi hijo(a) en el sistema seguro del hospital. Acepto que sean analizados por programas de computadora (inteligencia artificial) para buscar un posible diagnóstico, y que la información sea utilizada para hacer análisis estadísticos que ayuden a mejorar la detección de estas enfermedades.',
            chipText: 'Obligatoria',
            chipColor: 'red',
            required: true,
        },
        {
            id: 'contacto-futuro',
            title: 'Contacto futuro',
            description:
                'Acepto que los médicos del hospital, o bien laboratorios e instituciones médicas autorizadas que colaboran con ellos, se comuniquen conmigo en el futuro si existen nuevos estudios, pruebas o información importante que pueda ayudar con el diagnóstico de mi hijo(a).',
            chipText: 'Opcional',
            chipColor: 'blue',
            required: false,
        },
        {
            id: 'aceptacion-final',
            title: 'Aceptación Final',
            description:
                'Declaro que he leído, entendido y aceptado el contenido de este consentimiento informado. Se me ha dado el tiempo para hacer preguntas y todas mis dudas han sido resueltas por el médico.',
            chipText: 'Obligatoria',
            chipColor: 'red',
            required: true,
        },
    ],

    signaturesTitle: 'Firmas y Validación',
    patientDataTitle: 'Datos del Paciente',
}