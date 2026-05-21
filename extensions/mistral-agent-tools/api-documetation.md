

# Create an Image Generation Agent
```typescript
let imageAgent = await client.beta.agents.create({
    model:"mistral-medium-latest",
    name:"Image Generation Agent",
    description:"Agent used to generate images.",
    instructions:"Use the image generation tool when you have to create images.",
    tools:[{
        type: "image_generation"
    }],
    completionArgs:{
        temperature: 0.3,
        topP: 0.95,
    }
});
```


# Conversations with Image Generation


```typescript
let conversation = await client.beta.conversations.start({
      agentId: imageAgent.id,
      inputs:"Generate an orange cat in an office.",
      //store:false
});
```
Below we will explain the different outputs of the response of the previous snippet example:

    tool.execution: This entry corresponds to the execution of the image generation tool. It includes metadata about the execution, such as:
        name: The name of the tool, which in this case is image_generation.
        object: The type of object, which is entry.
        type: The type of entry, which is tool.execution.
        created_at and completed_at: Timestamps indicating when the tool execution started and finished.
        id: A unique identifier for the tool execution.

    message.output: This entry corresponds to the generated answer from our agent. It includes metadata about the message, such as:
        content: The actual content of the message, which in this case is a list of chunks. These chunks can be of different types, and the model can interleave different chunks, using text chunks and others to complete the message. In this case, we got a two chunks corresponding to a text chunk and a tool_file, which represents the generated file, specifically the generated image. The content section includes:
            tool: The name of the tool used for generating the file, which in this case is image_generation.
            file_id: A unique identifier for the generated file.
            type: The type of chunk, which in this case is tool_file.
            file_name: The name of the generated file.
            file_type: The type of the generated file, which in this case is png.
        object: The type of object, which is entry.
        type: The type of entry, which is message.output.
        created_at and completed_at: Timestamps indicating when the message was created and completed.
        id: A unique identifier for the message.
        agent_id: A unique identifier for the agent that generated the message.
        model: The model used to generate the message, which in this case is mistral-medium-latest.
        role: The role of the message, which is assistant.



# Downlaod Images

```typescript
// Add the following imports:
import *  as fs from 'fs';
import type { ToolFileChunk, MessageOutputEntry, ConversationResponse } from "@mistralai/mistralai/models/components/index.js";

// Function used to save your image:
async function saveStreamToFile(stream: ReadableStream<Uint8Array>, filePath: string): Promise<void> {
    const reader = stream.getReader();
    const writableStream = fs.createWriteStream(filePath);

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        writableStream.write(Buffer.from(value));
    }

    writableStream.end();
}

// Conversation content retrieval, and call the `saveStreamToFile` function.
const entry = conversation.outputs[conversation.outputs.length - 1];
const messageOutputEntry = entry as MessageOutputEntry;

const chunk = messageOutputEntry.content[1];
if (typeof(chunk) != "string" && 'fileId' in chunk) {
    const fileChunk = chunk as ToolFileChunk;
    const fileStream = await client.files.download({ fileId: fileChunk.fileId });
    await saveStreamToFile(fileStream, `image_generated.png`);
}
```


A full code snippet to download all generated images from a response could look like so:

```typescript
async function processFileChunks(conversation: ConversationResponse) {
    const entry = conversation.outputs[conversation.outputs.length - 1];
    const messageOutputEntry = entry as MessageOutputEntry;
    for (let i = 0; i < messageOutputEntry.content.length; i++) {
        const chunk = messageOutputEntry.content[i];
        if (typeof(chunk) != "string" && 'fileId' in chunk) {
            const fileChunk = chunk as ToolFileChunk;
            const fileStream = await client.files.download({ fileId: fileChunk.fileId });
            await saveStreamToFile(fileStream, `image_generated_${i}.png`);
        }
    }
}
```



# Web search

Our built-in tool for websearch allows any of our models to access the web at any point to search websites and sources for relevant information to answer the given query.

There are two versions:

- web_search: A simple web search tool that enables access to a search engine.
- web_search_premium: A more complex web search tool that enables access to both a search engine and to news articles via integrated news provider verification.

You can create an agent with access to websearch by providing it as one of the tools.
Note that you can still add more tools to the agent, the model is free to search the web or not on demand.


```typescript
const websearchAgent = await client.beta.agents.create({
  model: "mistral-medium-latest",
  name: "WebSearch Agent",
  instructions: "Use your websearch abilities when answering requests you don't know.",
  description: "Agent able to fetch new information on the web.",
  tools: [{ type: "web_search" }],
});
```

As for other agents, when creating one you will receive an agent id corresponding to the created agent that you can use to start a conversation.

Now that we have our websearch agent ready, we can at any point make use of it to ask it questions about recent events.

Conversations with Websearch
Conversations with Websearch

To start a conversation with our websearch agent, we can use the following code:

```typescript
let conversation = await client.beta.conversations.start({
      agentId: agent.id,
      inputs:"Who is Albert Einstein?",
      //store:false
});
```

Below we will explain the different outputs of the response of the previous snippet example:

    tool.execution: This entry corresponds to the execution of the web search tool. It includes metadata about the execution, such as:
        name: The name of the tool, which in this case is web_search.
        object: The type of object, which is entry.
        type: The type of entry, which is tool.execution.
        created_at and completed_at: Timestamps indicating when the tool execution started and finished.
        id: A unique identifier for the tool execution.

    message.output: This entry corresponds to the generated answer from our agent. It includes metadata about the message, such as:
        content: The actual content of the message, which in this case is a list of chunks. These chunks correspond to the text chunks, the actual message response of the model, interleaved with reference chunks. These reference chunks are used for citations during Retrieval-Augmented Generation (RAG) related tool usages. In this case, it provides the source of the information it just answered with, which is extremely useful for web search. This allows for transparent feedback on where the model got its response from for each section and fact answered with. The content section includes:
            type: The type of chunk, which can be text or tool_reference.
            text: The actual text content of the message.
            tool: The name of the tool used for the reference, which in this case is web_search.
            title: The title of the reference source.
            url: The URL of the reference source.
            source: The source of the reference.
        object: The type of object, which is entry.
        type: The type of entry, which is message.output.
        created_at and completed_at: Timestamps indicating when the message was created and completed.
        id: A unique identifier for the message.
        agent_id: A unique identifier for the agent that generated the message.
        model: The model used to generate the message, which in this case is mistral-medium-latest.
        role: The role of the message, which is assistant.
