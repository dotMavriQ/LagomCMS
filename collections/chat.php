<?php

return [
    'name' => 'chat',
    'label' => 'AI Chat',
    'group' => 'Integrations',
    'order' => 71,
    'singleton' => true,
    // Configuration or a fragment of a page, not a page of its own.
    'seo' => false,

    // The "ask" button in the corner of every page, and the small chat window behind it.
    //
    // The CMS does not answer the questions. A visitor's browser sends each one straight
    // to the address under Endpoint, which is a service of your own: a Cloudflare Worker
    // in front of Workers AI is the usual choice, and examples/chat-worker/ is one you
    // can deploy as it is. Anything that speaks the same two lines of JSON will do:
    //
    //     the page sends    {"message": "...", "previous": {"question": "...", "answer": "..."}}
    //     and expects       {"reply": "..."}
    //
    // No key or token belongs in here. Everything on this screen ends up in the public
    // pages; secrets stay with the service that does the answering.
    'fields' => [
        ['name' => 'title', 'type' => 'text', 'label' => 'Name', 'required' => true, 'default' => 'Assistant', 'help' => 'What the assistant is called. Shown at the top of the chat window.'],
        ['name' => 'enabled', 'type' => 'boolean', 'label' => 'Show on the site', 'help' => 'Off, and the button is not on any page. It also stays away while there is no endpoint.'],
        ['name' => 'endpoint', 'type' => 'text', 'label' => 'Endpoint', 'help' => 'The address questions are sent to, starting with https://. This is your own service, for example a Cloudflare Worker. It has to allow requests from this site (CORS).'],
        ['name' => 'tagline', 'type' => 'text', 'label' => 'Tagline', 'help' => 'The small line under the name.'],
        ['name' => 'greeting', 'type' => 'text', 'label' => 'Greeting', 'help' => 'The first message in the window, before the visitor has asked anything.'],
        ['name' => 'placeholder', 'type' => 'text', 'label' => 'Placeholder', 'help' => 'The grey text in the box where questions are typed.'],
        ['name' => 'launcher', 'type' => 'text', 'label' => 'Button label', 'default' => 'ask', 'help' => 'The word on the button in the corner of the page.'],
        ['name' => 'avatar', 'type' => 'asset', 'label' => 'Avatar', 'accept' => ['image/png', 'image/webp', 'image/jpeg'], 'help' => 'A small square picture of the assistant, shown round. With nothing uploaded, the window simply has none.'],
        ['name' => 'busy_message', 'type' => 'text', 'label' => 'When it has run out', 'quiet' => true, 'help' => 'What the assistant says when your service answers "too many requests" or has used up its allowance for the day.'],
    ],

    'body' => ['enabled' => false],

    // read: 'public' (anyone) or 'published' (anyone once status is published, otherwise signed in).
    // The rest name the lowest role allowed; an action left out is not offered at all.
    'access' => ['read' => 'public', 'update' => 'admin'],
];
