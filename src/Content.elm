port module Content exposing (main)

{-| Content-script logic.

All DOM access, InboxSDK calls, and Chrome messaging live in the JS
wrapper (content_init.js).  This module owns the only piece of real
state: whether a quote is waiting to be inserted once a compose view
opens.

State machine
─────────────
  Idle
    │  TriggerReplyWithOpenView text
    ├──────────────────────────────► emit insertQuote text  →  Idle
    │
    │  TriggerReplyNoView text
    └──────────────────────────────► emit triggerReplyButton
                                     store text             →  Pending text

  Pending text
    │  ComposeViewOpened
    └──────────────────────────────► emit insertQuote text  →  Idle
-}

import Platform


-- MODEL


type alias Model =
    { pendingQuoteText : Maybe String
    }


-- MSG


type Msg
    = TriggerReplyWithOpenView String
    | TriggerReplyNoView String
    | ComposeViewOpened


-- INIT


init : () -> ( Model, Cmd Msg )
init _ =
    ( { pendingQuoteText = Nothing }, Cmd.none )


-- UPDATE


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        TriggerReplyWithOpenView text ->
            -- A compose view is already open: insert immediately.
            ( model, insertQuote text )

        TriggerReplyNoView text ->
            -- No open compose view yet: remember the text and ask JS to
            -- click the nearest reply button so InboxSDK fires
            -- composeViewOpened when the compose window appears.
            ( { model | pendingQuoteText = Just text }
            , triggerReplyButton ""
            )

        ComposeViewOpened ->
            case model.pendingQuoteText of
                Just text ->
                    -- The compose view the user triggered has just
                    -- opened: insert the pending quote and clear state.
                    ( { model | pendingQuoteText = Nothing }
                    , insertQuote text
                    )

                Nothing ->
                    -- The user opened a compose window independently;
                    -- nothing to do.
                    ( model, Cmd.none )


-- SUBSCRIPTIONS


subscriptions : Model -> Sub Msg
subscriptions _ =
    Sub.batch
        [ onTriggerReplyWithOpenView TriggerReplyWithOpenView
        , onTriggerReplyNoView TriggerReplyNoView
        , onComposeViewOpened (always ComposeViewOpened)
        ]


-- MAIN


main : Program () Model Msg
main =
    Platform.worker
        { init = init
        , update = update
        , subscriptions = subscriptions
        }


-- PORTS — incoming (JS → Elm)

{-| The user triggered a quote-reply and a compose view is already open. -}
port onTriggerReplyWithOpenView : (String -> msg) -> Sub msg

{-| The user triggered a quote-reply but no compose view is open yet. -}
port onTriggerReplyNoView : (String -> msg) -> Sub msg

{-| InboxSDK just opened a compose / reply view. -}
port onComposeViewOpened : (() -> msg) -> Sub msg


-- PORTS — outgoing (Elm → JS)

{-| Ask JS to insert the given text as a blockquote into the open compose view. -}
port insertQuote : String -> Cmd msg

{-| Ask JS to click the nearest Gmail reply button (opens a compose view). -}
port triggerReplyButton : String -> Cmd msg
