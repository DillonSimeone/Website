const limit = 10; // Limit of posts from reddit for each requests
const url = `https://www.reddit.com/r/memes.json` //Set this to a reddit subreddit... Adding .Json to the end of any reddit subreddit links turns it into an api!
const postArea = document.querySelector('img')
const debug = true; //Debugging mode toggle.
let index = 0; // Index for posts from the fetch.
let after; // Value to get the next sets of data from reddit API.
let posts; // This makes the onclick event easier to set up. Array is loaded into this var from the array.

function getPosts(url){
    let fetchUrl = url
    if(after || limit)
        fetchUrl += "?"

    if(limit)
        fetchUrl += `limit=${limit}`

    if(after){
        if(limit)
            fetchUrl += "&"
        fetchUrl += `after=${after}`
    }

    

    if(debug)
        console.log(`Fetching from: ${fetchUrl}`)

    fetch(`${fetchUrl}`)
        .then(res => res.json())
        .then(res => {
            if(debug){
                console.log('Data from fetch:')
                console.log(res)
            }
            after = res.data.after
            return res.data.children.map(post => ({
                author: post.data.author,
                link: post.data.url,
                img: post.data.thumbnail,
                title: post.data.title
            }))
        })
        .then(res => render(res))
        .catch(error => console.log("Fetch Error: " + error)) //Something went wrong with the fetch request!
}

function render(res) {
    if(index >= res.length){
        index = 0; //Reset the counter back to zero!
        getPosts(url, limit, after) //Gets a new array!
    }
    else{
        posts = res
        postArea.setAttribute('src', posts[index++].link)
    }

}

getPosts(url)