import React from 'react';
import PropTypes from 'prop-types';
import { CellMeasurer, CellMeasurerCache, List } from 'react-virtualized';
import { connect } from 'react-redux';
import { translate } from 'react-i18next';

import Dropdown from 'components/Dropdown';
import Note from 'components/Note';
import ListSeparator from 'components/ListSeparator';

import core from 'core';
import sortMap from 'constants/sortMap';
import selectors from 'selectors';

import './NotesPanel.scss';

class NotesPanel extends React.PureComponent {
  static propTypes = {
    isDisabled: PropTypes.bool,
    display: PropTypes.string.isRequired,
    sortNotesBy: PropTypes.string.isRequired,
    t: PropTypes.func.isRequired
  }
  
  constructor() {
    super();
    this.state = {
      noteStates: {}, 
      searchInput: ''
    };
    this.cache = new CellMeasurerCache({
      defaultHeight: 60,
      fixedWidth: true
    });
    this.listRef = React.createRef();
    this.rootAnnotations = [];
    this.updatePanelOnInput = _.debounce(this.updatePanelOnInput.bind(this), 500);
  }

  componentDidMount() {
    core.addEventListener('documentUnloaded', this.onDocumentUnloaded);
    core.addEventListener('addReply', this.onAddReply);
    core.addEventListener('deleteReply', this.onDeleteReply);
    core.addEventListener('annotationChanged', this.onAnnotationChanged);
    core.addEventListener('annotationHidden', this.onAnnotationChanged);
  }

  componentDidUpdate(prevProps, prevState) {
    if (
      Object.keys(prevState.noteStates).length !== Object.keys(this.state.noteStates).length ||
      prevProps.sortNotesBy !== this.props.sortNotesBy
    ) {
      this.cache.clearAll();
      if (this.listRef.current) {
        this.listRef.current.recomputeRowHeights();
        this.listRef.current.forceUpdateGrid();
      }
    }
  }

  componentWillUnmount() {
    core.removeEventListener('documentUnloaded', this.onDocumentUnloaded);
    core.removeEventListener('addReply', this.onAddReply);
    core.removeEventListener('deleteReply', this.onDeleteReply);
    core.removeEventListener('annotationChanged', this.onAnnotationChanged);
    core.removeEventListener('annotationHidden', this.onAnnotationChanged);
  }

  onDocumentUnloaded = () => {
    this.setState({ noteStates: {} });
  }

  onAddReply = (e, reply, parent) => {
    this.setNoteState(parent.Id, {
      replies: {
        ...this.state.noteStates[parent.Id].replies,
        [reply.Id]: { isReplyFocused: false }
      }
    });
  }

  onDeleteReply = (e, reply, parent) => {
    const replies = { ...this.state.noteStates[parent.Id].replies };
    
    delete replies[reply.Id];
    setTimeout(() => {
      this.setNoteState(parent.Id, { replies });
    }, 0);
  }

  onAnnotationChanged = () => {
    this.setRootAnnotations();

    const notesToRender = this.filterAnnotations(this.rootAnnotations, this.state.searchInput);
    this.setNoteStates(notesToRender);
  }

  setNoteState = (Id, newState) => {
    if (!this.state.noteStates[Id]) {
      return;
    }

    this.setState({
      noteStates: {
        ...this.state.noteStates,
        [Id]: {
          ...this.state.noteStates[Id],
          ...newState
        }
      }
    });
  }

  setRootAnnotations = () => {
    this.rootAnnotations = core.getAnnotationsList().filter(annotation => annotation.Listable && !annotation.isReply() && !annotation.Hidden);
  }

  /*
    {
      id: {
        annotation
        isNoteExpanded,
        isRootContentEditing,
        isReplyFocused,
        replies: {
          id: { isReplyContentEditing }
          ...
        }
      }
      ...
    }
  */

  setNoteStates = notesToRender => {
    const noteStates = notesToRender.reduce((noteStates, note) => {
      let noteState = this.state.noteStates[note.Id]; 
      if (!noteState) {
        noteState = {
          annotation: note,
          isRootContentEditing: false,
          isReplyFocused: false,
          replies: note.getReplies().reduce((replies, reply) => {
            replies[reply.Id] = { isReplyFocused: false };
            return replies;
          }, {})
        };
      }

      noteStates[note.Id] = noteState;
      return noteStates;
    }, {});

    this.setState({ noteStates });
  } 

  handleInputChange = e => {
    const searchInput = e.target.value;

    // this.updatePanelOnInput(searchInput);
  }

  updatePanelOnInput = searchInput => {
    let notesToRender;

    core.deselectAllAnnotations();
    if (searchInput.trim()) {
      notesToRender = this.filterAnnotations(this.rootAnnotations, searchInput);
      core.selectAnnotations(notesToRender); 
    } else { 
      notesToRender = this.rootAnnotations;
    }

    this.setState({ notesToRender, searchInput });
  }

  filterAnnotations = (annotations, searchInput) => {
    return annotations.filter(rootAnnotation => {
      const replies = rootAnnotation.getReplies();
      // reply is also a kind of annotation
      // https://www.pdftron.com/api/web/CoreControls.AnnotationManager.html#createAnnotationReply__anchor
      const annotations = [ rootAnnotation, ...replies ];

      return annotations.some(annotation => {
        const content = annotation.getContents();
        const authorName = core.getDisplayAuthor(annotation);

        return this.isInputIn(content, searchInput) || this.isInputIn(authorName, searchInput);
      });
    });
  }

  isInputIn = (string, searchInput) => {
    if (!string) {
      return false;
    }

    return string.search(new RegExp(searchInput, 'i')) !== -1;
  }

  renderNotesPanelContent = () => {
    const { noteStates } = this.state;
    let notesToRender = Object.keys(noteStates).map(core.getAnnotationById);
    notesToRender = sortMap[this.props.sortNotesBy].getSortedNotes(notesToRender);

    return(
      <React.Fragment>
        <div className={`notes-wrapper ${notesToRender.length ? 'visible' : 'hidden'}`}>
          <List
            ref={this.listRef}
            width={300}
            height={500}
            rowCount={notesToRender.length}
            deferredMeasurementCache={this.cache}
            rowHeight={this.cache.rowHeight}
            // noteStates={this.state.noteStates}
            rowRenderer={({ key, index, style, parent }) => (
              <CellMeasurer
                cache={this.cache}
                columnIndex={0}
                key={key}
                parent={parent}
                rowIndex={index}
              >
                {({ measure }) => (
                  <div className="note-wrapper" style={{ ...style}}>
                    {this.renderListSeparator(notesToRender, index)}
                    <Note
                      {...noteStates[notesToRender[index].Id]}
                      setNoteState={this.setNoteState}
                      searchInput={this.state.searchInput}
                      measure={measure}
                    />
                  </div>
                )}
              </CellMeasurer>
            )}
          />
        </div>
        <div className={`no-results ${notesToRender.length ? 'hidden' : 'visible'}`}>
          {this.props.t('message.noResults')}
        </div>
      </React.Fragment>
    );
  }

  renderListSeparator = (notes, index) => {
    const { shouldRenderSeparator, getSeparatorContent } = sortMap[this.props.sortNotesBy];
    const currNote = notes[index];
    const prevNote = index === 0 ? currNote: notes[index-1];
    const isFirstNote = prevNote === currNote;

    if (
      shouldRenderSeparator && 
      getSeparatorContent &&
      (isFirstNote || shouldRenderSeparator(prevNote, currNote))
    ) {
      return <ListSeparator renderContent={() => getSeparatorContent(prevNote, currNote)} />;
    }

    return null;
  }

  render() {
    const { isDisabled, display, t } = this.props;

    if (isDisabled) {
      return null;
    }
    
    return (
      <div className="Panel NotesPanel" style={{ display }} data-element="notesPanel" onClick={() => core.deselectAllAnnotations()}>
        {this.rootAnnotations.length === 0 
        ? <div className="no-annotations">{t('message.noAnnotations')}</div>
        : <React.Fragment>
            <div className="header">
              <input 
                type="text" 
                placeholder={t('message.searchPlaceholder')}
                onChange={this.handleInputChange} 
              />
              <Dropdown items={Object.keys(sortMap)} />
            </div>
            {this.renderNotesPanelContent()}
          </React.Fragment>
        }
      </div>
    );
  }
}

const mapStatesToProps = state => ({
  sortNotesBy: selectors.getSortNotesBy(state),
  isDisabled: selectors.isElementDisabled(state, 'notesPanel')
});

export default connect(mapStatesToProps)(translate()(NotesPanel));
