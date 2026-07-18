const fetch = global.fetch;

async function test() {
  const res = await fetch(
    "https://api.cloudflare.com/client/v4/accounts/25cdd76cf8f843f08d0e62ceee666de6/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: "Say Hello",
          },
        ],
      }),
    }
  );

  console.log(await res.json());
}

test();